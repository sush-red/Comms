const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));

const io = new Server(server, { cors: { origin: '*', methods: ["GET", "POST"] } });

app.get('/api/health', (req, res) => {
    res.json({ status: 'online', message: 'Comms Pro API is running', timestamp: new Date() });
});

const pool = new Pool({ host: 'localhost', port: 5432, database: 'commspro' });

pool.connect((err, client, release) => {
    if (err) return console.error("Database connection error:", err.stack);
    console.log("Connected to PostgreSQL Database.");
    release();
});

// Initialize Schema with new Preference & Admin columns
// Initialize Schema with new Preference & Admin columns
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id VARCHAR PRIMARY KEY, room VARCHAR, "user" VARCHAR, text TEXT,
                file_name VARCHAR, file_type VARCHAR, file_data TEXT,
                reply_to_id VARCHAR, reply_to_user VARCHAR, reply_to_text TEXT,
                reactions JSONB DEFAULT '{"👍":[],"👎":[],"❤️":[],"✅":[],"👀":[]}'::jsonb, 
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_deleted INTEGER DEFAULT 0, is_pinned INTEGER DEFAULT 0, deleted_for JSONB DEFAULT '[]'::jsonb
            )
        `);
        await pool.query(`CREATE TABLE IF NOT EXISTS custom_channels (name VARCHAR PRIMARY KEY, members JSONB DEFAULT '[]'::jsonb)`);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR PRIMARY KEY, role VARCHAR, email VARCHAR DEFAULT '', contact VARCHAR DEFAULT '', status_msg VARCHAR DEFAULT 'Available'
            )
        `);
        
        // --- THE FIX: Force Postgres to add the new Phase 4 columns to your existing table ---
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN DEFAULT true`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sound_alerts BOOLEAN DEFAULT true`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mention_alerts BOOLEAN DEFAULT true`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT false`);

        await pool.query(`CREATE TABLE IF NOT EXISTS events (id VARCHAR PRIMARY KEY, title VARCHAR, start_time VARCHAR, end_time VARCHAR, description TEXT, organizer VARCHAR)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS event_attendees (event_id VARCHAR, username VARCHAR, status VARCHAR)`);
        
        console.log("Database initialized and Phase 4 schema migrated successfully.");
    } catch (error) { 
        console.error("Database Init error:", error); 
    }
}
initializeDatabase();

io.on('connection', (socket) => {
    socket.on('login', async (data) => {
        try {
            // Check if user exists and is disabled
            const userCheck = await pool.query("SELECT is_disabled FROM users WHERE username = $1", [data.username]);
            if (userCheck.rows.length > 0 && userCheck.rows[0].is_disabled) {
                return socket.emit('login error', 'Your account has been disabled by an administrator.');
            }

            socket.username = data.username;
            socket.role = data.role;
            socket.join(data.username); 

            await pool.query(
                "INSERT INTO users (username, role) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING", 
                [data.username, data.role]
            );

            // Fetch user preferences
            const prefs = await pool.query("SELECT dark_mode, sound_alerts, mention_alerts FROM users WHERE username = $1", [data.username]);
            
            const allUsers = await pool.query("SELECT username FROM users WHERE is_disabled = false");
            io.emit('all users list', allUsers.rows.map(r => r.username));

            const channels = await pool.query("SELECT * FROM custom_channels");
            const myCustomChannels = channels.rows.filter(row => {
                const members = typeof row.members === 'string' ? JSON.parse(row.members) : row.members;
                return members && members.includes(data.username);
            }).map(row => row.name);
            
            const dms = await pool.query("SELECT DISTINCT room FROM messages WHERE room LIKE 'DM-%'");
            const myDMs = dms.rows.map(row => row.room).filter(room => room.replace('DM-', '').split('-').includes(data.username));
            
            socket.emit('login success', { 
                customChannels: myCustomChannels, 
                dmRooms: myDMs,
                preferences: prefs.rows[0] || { dark_mode: true, sound_alerts: true, mention_alerts: true }
            });

            const activeUsers = Array.from(io.sockets.sockets.values()).map(s => s.username).filter(Boolean);
            io.emit('global presence', activeUsers);
        } catch (err) { console.error(err); }
    });

    socket.on('get all users', () => {
        pool.query("SELECT username FROM users WHERE is_disabled = false", [], (err, res) => {
            if (!err) socket.emit('all users list', res.rows.map(r => r.username));
        });
    });

    socket.on('join room', (data) => {
        const roomToJoin = data.room;
        socket.currentRoom = roomToJoin;
        Array.from(socket.rooms).forEach(room => { if (room !== socket.id && room !== socket.username) socket.leave(room); });
        socket.join(roomToJoin);

        pool.query("SELECT * FROM messages WHERE room = $1 ORDER BY timestamp DESC LIMIT 50", [roomToJoin], (err, res) => {
            if (!err) {
                const history = res.rows.reverse().map(formatMessageRow).filter(msg => !msg.deleted_for.includes(socket.username));
                socket.emit('chat history', history);
            }
        });

        if (roomToJoin.startsWith('DM-')) {
            socket.emit('room directory', roomToJoin.replace('DM-', '').split('-'));
        } else {
            pool.query("SELECT members FROM custom_channels WHERE name = $1", [roomToJoin], (err, res) => {
                if (res && res.rows.length > 0) {
                    socket.emit('room directory', typeof res.rows[0].members === 'string' ? JSON.parse(res.rows[0].members) : res.rows[0].members);
                } else {
                    pool.query("SELECT username FROM users WHERE is_disabled = false", [], (err, uRes) => {
                        if (!err) io.to(roomToJoin).emit('room directory', uRes.rows.map(r => r.username));
                    });
                }
            });
        }
    });

    socket.on('chat message', (data) => {
        data.id = Math.random().toString(36).substr(2, 9);
        data.reactions = { '👍': [], '👎': [], '❤️': [], '✅': [], '👀': [] };
        io.to(data.room).emit('chat message', data);
        
        pool.query(
            `INSERT INTO messages (id, room, "user", text, file_name, file_type, file_data, reactions) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, 
            [data.id, data.room, data.user, data.text, data.file?.name, data.file?.type, data.file?.data, JSON.stringify(data.reactions)]
        );

        // Notify others
        if (data.room.startsWith('DM-')) {
            data.room.replace('DM-', '').split('-').forEach(u => { if (u !== data.user) io.to(u).emit('unread alert', data); });
        } else {
            pool.query("SELECT members FROM custom_channels WHERE name = $1", [data.room], (err, res) => {
                if (res && res.rows.length > 0) {
                    const members = typeof res.rows[0].members === 'string' ? JSON.parse(res.rows[0].members) : res.rows[0].members;
                    members.forEach(u => { if (u !== data.user) io.to(u).emit('unread alert', data); });
                } else socket.broadcast.emit('unread alert', data);
            });
        }
    });

    socket.on('add reaction', (rData) => {
        pool.query("SELECT reactions FROM messages WHERE id = $1", [rData.msgId], (err, res) => {
            if (err || !res.rows.length) return;
            let rx = typeof res.rows[0].reactions === 'string' ? JSON.parse(res.rows[0].reactions) : res.rows[0].reactions;
            if (!rx[rData.emoji]) rx[rData.emoji] = [];
            const idx = rx[rData.emoji].indexOf(rData.username);
            if (idx === -1) rx[rData.emoji].push(rData.username); else rx[rData.emoji].splice(idx, 1);
            pool.query("UPDATE messages SET reactions = $1 WHERE id = $2", [JSON.stringify(rx), rData.msgId], () => {
                io.to(rData.roomId).emit('update reaction', { msgId: rData.msgId, emoji: rData.emoji, users: rx[rData.emoji] });
            });
        });
    });

    // User Preferences & Profile
    socket.on('get profile', (targetUser) => {
        pool.query("SELECT username, role, email, contact, status_msg, dark_mode, sound_alerts, mention_alerts FROM users WHERE username = $1", [targetUser], (err, res) => {
            if (res && res.rows.length > 0) socket.emit('profile data', res.rows[0]);
        });
    });

    socket.on('update profile', (data) => {
        if (socket.username !== data.username) return;
        pool.query("UPDATE users SET email=$1, contact=$2, status_msg=$3, dark_mode=$4, sound_alerts=$5, mention_alerts=$6 WHERE username=$7", 
            [data.email, data.contact, data.status_msg, data.dark_mode, data.sound_alerts, data.mention_alerts, data.username], () => {
                socket.emit('profile updated successfully');
            });
    });

    // --- CENTRAL ADMIN CONTROLS ---
    socket.on('admin get data', async () => {
        if (socket.role !== 'central') return;
        try {
            const users = await pool.query("SELECT username, role, email, is_disabled FROM users");
            const channels = await pool.query("SELECT name, members FROM custom_channels");
            socket.emit('admin data payload', { users: users.rows, channels: channels.rows });
        } catch(e) { console.error(e); }
    });

    socket.on('admin toggle user', async ({ targetUser, disable }) => {
        if (socket.role !== 'central' || targetUser === socket.username) return;
        await pool.query("UPDATE users SET is_disabled = $1 WHERE username = $2", [disable, targetUser]);
        socket.emit('admin action success', `${targetUser} has been ${disable ? 'disabled' : 'enabled'}.`);
    });

    socket.on('admin delete channel', async (channelName) => {
        if (socket.role !== 'central') return;
        await pool.query("DELETE FROM custom_channels WHERE name = $1", [channelName]);
        await pool.query("DELETE FROM messages WHERE room = $1", [channelName]);
        io.emit('channel deleted', channelName);
        socket.emit('admin action success', `Channel ${channelName} deleted.`);
    });

    // ... (Keep existing Calendar socket logic here) ...
    socket.on('disconnect', () => { io.emit('global presence', Array.from(io.sockets.sockets.values()).map(s => s.username).filter(Boolean)); });
});

function formatMessageRow(row) {
    let rawTs = row.timestamp; if (rawTs instanceof Date) rawTs = rawTs.toISOString().replace('T', ' ').substring(0, 19);
    return {
        id: row.id, user: row.user, text: row.text, room: row.room,
        file: row.file_name ? { name: row.file_name, type: row.file_type, data: row.file_data } : null,
        reactions: typeof row.reactions === 'string' ? JSON.parse(row.reactions) : row.reactions,
        timestamp: rawTs, is_deleted: row.is_deleted, is_pinned: row.is_pinned,
        deleted_for: typeof row.deleted_for === 'string' ? JSON.parse(row.deleted_for || '[]') : (row.deleted_for || [])
    };
}

server.listen(3000, () => { console.log(`Server listening on http://localhost:3000`); });