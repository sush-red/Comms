const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg'); // Changed from sqlite3 to pg
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Configure your Postgres Connection Pool
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'commspro',
    // Uncomment and fill these if your local Postgres setup requires credentials:
    // user: 'your_username',
    // password: 'your_password',
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error("Error acquiring client. Make sure PostgreSQL is running:", err.stack);
    }
    console.log("Connected to PostgreSQL Database.");
    release();
});

// Initialize Schema with Postgres specific constraints and JSONB types
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id VARCHAR PRIMARY KEY, 
                room VARCHAR, 
                "user" VARCHAR, 
                text TEXT,
                file_name VARCHAR, 
                file_type VARCHAR, 
                file_data TEXT,
                reply_to_id VARCHAR, 
                reply_to_user VARCHAR, 
                reply_to_text TEXT,
                reactions JSONB DEFAULT '{"👍":[],"👎":[],"❤️":[],"✅":[],"👀":[]}'::jsonb, 
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_deleted INTEGER DEFAULT 0,
                is_pinned INTEGER DEFAULT 0,
                deleted_for JSONB DEFAULT '[]'::jsonb
            )
        `);

        await pool.query(`CREATE TABLE IF NOT EXISTS custom_channels (name VARCHAR PRIMARY KEY, members JSONB DEFAULT '[]'::jsonb)`);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR PRIMARY KEY, 
                role VARCHAR,
                email VARCHAR DEFAULT '',
                contact VARCHAR DEFAULT '',
                status_msg VARCHAR DEFAULT 'Available'
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS events (
                id VARCHAR PRIMARY KEY, 
                title VARCHAR, 
                start_time VARCHAR, 
                end_time VARCHAR, 
                description TEXT, 
                organizer VARCHAR
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS event_attendees (
                event_id VARCHAR, 
                username VARCHAR, 
                status VARCHAR
            )
        `);
        console.log("PostgreSQL schema validated and initialized.");
    } catch (error) {
        console.error("Database initialization error:", error);
    }
}

initializeDatabase();

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        socket.username = data.username;
        socket.role = data.role;
        socket.join(data.username); 

        // ON CONFLICT replaces SQLite's INSERT OR IGNORE
        pool.query("INSERT INTO users (username, role) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING", [data.username, data.role], () => {
            pool.query("SELECT username FROM users", [], (err, res) => {
                if (!err) io.emit('all users list', res.rows.map(r => r.username));
            });
        });

        pool.query("SELECT * FROM custom_channels", [], (err, res) => {
            if (!err) {
                const myCustomChannels = res.rows
                    .filter(row => {
                        const members = typeof row.members === 'string' ? JSON.parse(row.members) : row.members;
                        return members && members.includes(data.username);
                    })
                    .map(row => row.name);
                
                pool.query("SELECT DISTINCT room FROM messages WHERE room LIKE 'DM-%'", [], (err, dmRes) => {
                    const myDMs = [];
                    if (!err) {
                        dmRes.rows.forEach(row => {
                            const usersInRoom = row.room.replace('DM-', '').split('-');
                            if (usersInRoom.includes(data.username)) myDMs.push(row.room);
                        });
                    }
                    socket.emit('login success', { customChannels: myCustomChannels, dmRooms: myDMs });
                });
            }
        });

        const activeUsers = Array.from(io.sockets.sockets.values()).map(s => s.username).filter(Boolean);
        io.emit('global presence', activeUsers);
    });

    socket.on('get all users', () => {
        pool.query("SELECT username FROM users", [], (err, res) => {
            if (!err) socket.emit('all users list', res.rows.map(r => r.username));
        });
    });

    socket.on('join room', (data) => {
        const roomToJoin = data.room;
        socket.currentRoom = roomToJoin;

        Array.from(socket.rooms).forEach(room => {
            if (room !== socket.id && room !== socket.username) socket.leave(room);
        });
        socket.join(roomToJoin);

        pool.query("SELECT * FROM messages WHERE room = $1 ORDER BY timestamp DESC LIMIT 50", [roomToJoin], (err, res) => {
            if (err) return console.error(err);
            const history = res.rows.reverse().map(formatMessageRow).filter(msg => !msg.deleted_for.includes(socket.username));
            socket.emit('chat history', history);
        });

        if (roomToJoin.startsWith('DM-')) {
            const mentionable = roomToJoin.replace('DM-', '').split('-');
            socket.emit('room directory', mentionable);
        } else {
            pool.query("SELECT members FROM custom_channels WHERE name = $1", [roomToJoin], (err, res) => {
                const row = res && res.rows.length > 0 ? res.rows[0] : null;
                if (row) {
                    const members = typeof row.members === 'string' ? JSON.parse(row.members) : row.members;
                    socket.emit('room directory', members);
                } else {
                    pool.query("SELECT username FROM users", [], (err, uRes) => {
                        if (!err) io.to(roomToJoin).emit('room directory', uRes.rows.map(r => r.username));
                    });
                }
            });
        }
        
        const clients = io.sockets.adapter.rooms.get(roomToJoin);
        if (clients) {
            const usersInRoom = Array.from(clients).map(id => io.sockets.sockets.get(id)?.username).filter(Boolean);
            io.to(roomToJoin).emit('room users', usersInRoom);
        }
    });

    socket.on('rename room', (data) => {
        const { oldName, newName } = data;
        pool.query("SELECT name FROM custom_channels WHERE name = $1", [newName], (err, res) => {
            const row = res && res.rows.length > 0 ? res.rows[0] : null;
            if (row) {
                socket.emit('room rename error', 'A channel or group with this name already exists.');
            } else {
                pool.query("UPDATE custom_channels SET name = $1 WHERE name = $2", [newName, oldName], () => {
                    pool.query("UPDATE messages SET room = $1 WHERE room = $2", [newName, oldName], () => {
                        pool.query("SELECT members FROM custom_channels WHERE name = $1", [newName], (err, memRes) => {
                            const memRow = memRes && memRes.rows.length > 0 ? memRes.rows[0] : null;
                            if (memRow) {
                                const members = typeof memRow.members === 'string' ? JSON.parse(memRow.members) : memRow.members;
                                members.forEach(u => io.to(u).emit('room renamed', { oldName, newName }));
                            }
                        });
                    });
                });
            }
        });
    });

    socket.on('add channel members', (data) => {
        const { room, newUsers } = data;
        pool.query("SELECT members FROM custom_channels WHERE name = $1", [room], (err, res) => {
            const row = res && res.rows.length > 0 ? res.rows[0] : null;
            if (row) {
                let members = typeof row.members === 'string' ? JSON.parse(row.members) : row.members;
                let changed = false;
                newUsers.forEach(u => {
                    if (!members.includes(u)) { members.push(u); changed = true; }
                });
                if (changed) {
                    pool.query("UPDATE custom_channels SET members = $1 WHERE name = $2", [JSON.stringify(members), room], () => {
                        newUsers.forEach(u => io.to(u).emit('new custom channel', room));
                        io.to(room).emit('room directory update');
                    });
                }
            }
        });
    });

    socket.on('remove channel member', (data) => {
        const { room, userToRemove } = data;
        pool.query("SELECT members FROM custom_channels WHERE name = $1", [room], (err, res) => {
            const row = res && res.rows.length > 0 ? res.rows[0] : null;
            if (row) {
                let members = typeof row.members === 'string' ? JSON.parse(row.members) : row.members;
                members = members.filter(u => u !== userToRemove);
                pool.query("UPDATE custom_channels SET members = $1 WHERE name = $2", [JSON.stringify(members), room], () => {
                    io.to(userToRemove).emit('removed from channel', room);
                    io.to(room).emit('room directory update');
                });
            }
        });
    });

    socket.on('bulk remove channel members', (data) => {
        const { room, usersToRemove } = data;
        pool.query("SELECT members FROM custom_channels WHERE name = $1", [room], (err, res) => {
            const row = res && res.rows.length > 0 ? res.rows[0] : null;
            if (row) {
                let members = typeof row.members === 'string' ? JSON.parse(row.members) : row.members;
                members = members.filter(u => !usersToRemove.includes(u));
                pool.query("UPDATE custom_channels SET members = $1 WHERE name = $2", [JSON.stringify(members), room], () => {
                    usersToRemove.forEach(u => io.to(u).emit('removed from channel', room));
                    io.to(room).emit('room directory update');
                });
            }
        });
    });

    socket.on('promote to admin', (targetUser) => {
        if (socket.role === 'admin' || socket.role === 'central') {
            pool.query("UPDATE users SET role = 'admin' WHERE username = $1", [targetUser], () => {
                io.emit('user promoted', targetUser);
            });
        }
    });

    socket.on('delete message', (data) => {
        pool.query("SELECT timestamp, \"user\" FROM messages WHERE id = $1", [data.msgId], (err, res) => {
            const row = res && res.rows.length > 0 ? res.rows[0] : null;
            if (err || !row) return;
            if (row.user !== socket.username && socket.role !== 'admin' && socket.role !== 'central') return;
            const msgTime = new Date(row.timestamp).getTime();
            if (Date.now() - msgTime <= 30 * 60 * 1000) {
                pool.query("UPDATE messages SET is_deleted = 1 WHERE id = $1", [data.msgId], (err) => {
                    if (!err) io.to(data.room).emit('message deleted', data.msgId);
                });
            }
        });
    });

    socket.on('delete for me', (data) => {
        pool.query("SELECT deleted_for FROM messages WHERE id = $1", [data.msgId], (err, res) => {
            const row = res && res.rows.length > 0 ? res.rows[0] : null;
            if (err || !row) return;
            let deletedForArray = typeof row.deleted_for === 'string' ? JSON.parse(row.deleted_for || '[]') : (row.deleted_for || []);
            if (!deletedForArray.includes(socket.username)) {
                deletedForArray.push(socket.username);
                pool.query("UPDATE messages SET deleted_for = $1 WHERE id = $2", [JSON.stringify(deletedForArray), data.msgId], (err) => {
                    if (!err) socket.emit('message deleted for me', data.msgId);
                });
            }
        });
    });

    socket.on('toggle pin', (data) => {
        pool.query("SELECT is_pinned FROM messages WHERE id = $1", [data.msgId], (err, res) => {
            const row = res && res.rows.length > 0 ? res.rows[0] : null;
            if (err || !row) return;
            const newStatus = row.is_pinned ? 0 : 1;
            pool.query("UPDATE messages SET is_pinned = $1 WHERE id = $2", [newStatus, data.msgId], (err) => {
                if (!err) io.to(data.room).emit('update pin', { msgId: data.msgId, isPinned: newStatus, msgData: data.msgData });
            });
        });
    });

    socket.on('load more messages', (data) => {
        pool.query("SELECT * FROM messages WHERE room = $1 ORDER BY timestamp DESC LIMIT 50 OFFSET $2", [data.room, data.offset], (err, res) => {
            if (err || !res || res.rows.length === 0) return;
            const olderHistory = res.rows.reverse().map(formatMessageRow).filter(msg => !msg.deleted_for.includes(socket.username));
            socket.emit('older messages', olderHistory);
        });
    });

    socket.on('search messages', (query) => {
        const searchQuery = `%${query}%`;
        // ILIKE handles case-insensitive search in Postgres natively
        pool.query("SELECT * FROM messages WHERE text ILIKE $1 AND is_deleted = 0 ORDER BY timestamp DESC LIMIT 20", [searchQuery], (err, res) => {
            if (!err) {
                const results = res.rows.map(formatMessageRow).filter(msg => !msg.deleted_for.includes(socket.username));
                socket.emit('search results', results);
            }
        });
    });

    socket.on('typing', (data) => { socket.to(data.room).emit('user typing', data.username); });
    socket.on('stop typing', (data) => { socket.to(data.room).emit('user stopped typing', data.username); });

    socket.on('create custom channel', (data) => {
        const { name, members } = data;
        pool.query("INSERT INTO custom_channels (name, members) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING", [name, JSON.stringify(members)], (err) => {
            if (!err) members.forEach(member => io.to(member).emit('new custom channel', name));
        });
    });

    socket.on('chat message', (data) => {
        data.id = Math.random().toString(36).substr(2, 9);
        data.reactions = { '👍': [], '👎': [], '❤️': [], '✅': [], '👀': [] };
        io.to(data.room).emit('chat message', data);
        const file = data.file || {};
        const reply = data.replyTo || {};
        
        pool.query(
            `INSERT INTO messages (id, room, "user", text, file_name, file_type, file_data, reply_to_id, reply_to_user, reply_to_text, reactions) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, 
            [data.id, data.room, data.user, data.text, file.name, file.type, file.data, reply.id, reply.user, reply.text, JSON.stringify(data.reactions)]
        );

        if (data.room.startsWith('DM-')) {
            const users = data.room.replace('DM-', '').split('-');
            users.forEach(u => { if (u !== data.user) io.to(u).emit('unread alert', data); });
        } else {
            pool.query("SELECT members FROM custom_channels WHERE name = $1", [data.room], (err, res) => {
                const row = res && res.rows.length > 0 ? res.rows[0] : null;
                if (row) {
                    const members = typeof row.members === 'string' ? JSON.parse(row.members) : row.members;
                    members.forEach(u => { if (u !== data.user) io.to(u).emit('unread alert', data); });
                } else socket.broadcast.emit('unread alert', data);
            });
        }
    });

    socket.on('add reaction', (reactionData) => {
        pool.query("SELECT reactions FROM messages WHERE id = $1", [reactionData.msgId], (err, res) => {
            const row = res && res.rows.length > 0 ? res.rows[0] : null;
            if (err || !row) return;
            let reactions = typeof row.reactions === 'string' ? JSON.parse(row.reactions) : row.reactions;
            let usersArray = reactions[reactionData.emoji];
            if (!usersArray) return; 
            const userIndex = usersArray.indexOf(reactionData.username);
            if (userIndex === -1) usersArray.push(reactionData.username);
            else usersArray.splice(userIndex, 1);
            pool.query("UPDATE messages SET reactions = $1 WHERE id = $2", [JSON.stringify(reactions), reactionData.msgId], (err) => {
                if (!err) io.to(reactionData.roomId).emit('update reaction', { msgId: reactionData.msgId, emoji: reactionData.emoji, users: usersArray });
            });
        });
    });

    socket.on('get profile', (targetUser) => {
        pool.query("SELECT username, role, email, contact, status_msg FROM users WHERE username = $1", [targetUser], (err, res) => {
            const row = res && res.rows.length > 0 ? res.rows[0] : null;
            if (row) socket.emit('profile data', row);
        });
    });

    socket.on('update profile', (data) => {
        if (socket.username !== data.username) return;
        pool.query("UPDATE users SET email = $1, contact = $2, status_msg = $3 WHERE username = $4", 
            [data.email, data.contact, data.status_msg, data.username], (err) => {
                if (!err) socket.emit('profile updated successfully');
            });
    });

    socket.on('get events', () => {
        // Postgres native json_agg for constructing arrays
        const query = `
            SELECT e.*, 
                   COALESCE(
                       (SELECT json_agg(json_build_object('username', ea.username, 'status', ea.status)) 
                        FROM event_attendees ea WHERE ea.event_id = e.id), 
                       '[]'::json
                   ) as attendees
            FROM events e
            WHERE e.organizer = $1 OR e.id IN (SELECT event_id FROM event_attendees WHERE username = $2)
        `;
        pool.query(query, [socket.username, socket.username], (err, res) => {
            if (!err && res) {
                // Ensure front-end receives stringified JSON matching original SQLite output
                const events = res.rows.map(e => ({
                    ...e,
                    attendees: typeof e.attendees === 'string' ? e.attendees : JSON.stringify(e.attendees || [])
                }));
                socket.emit('events data', events);
            }
        });
    });

    socket.on('get user calendar', (targetUser) => {
        const query = `
            SELECT e.*, 
                   COALESCE(
                       (SELECT json_agg(json_build_object('username', ea.username, 'status', ea.status)) 
                        FROM event_attendees ea WHERE ea.event_id = e.id), 
                       '[]'::json
                   ) as attendees
            FROM events e
            WHERE e.organizer = $1 OR e.id IN (SELECT event_id FROM event_attendees WHERE username = $2 AND status = 'accepted')
        `;
        pool.query(query, [targetUser, targetUser], (err, res) => {
            if (!err && res) {
                const events = res.rows.map(e => ({
                    ...e,
                    attendees: typeof e.attendees === 'string' ? e.attendees : JSON.stringify(e.attendees || [])
                }));
                socket.emit('user calendar data', { targetUser, events: events });
            }
        });
    });

    socket.on('create event', (data) => {
        const eventId = Math.random().toString(36).substr(2, 9);
        pool.query(`INSERT INTO events (id, title, start_time, end_time, description, organizer) VALUES ($1, $2, $3, $4, $5, $6)`,
            [eventId, data.title, data.startTime, data.endTime, data.description, socket.username], (err) => {
            if (err) return;
            data.attendees.forEach(attendee => {
                pool.query(`INSERT INTO event_attendees (event_id, username, status) VALUES ($1, $2, $3)`, [eventId, attendee, 'pending']);
                io.to(attendee).emit('new meeting invite', { title: data.title, organizer: socket.username });
            });
            const involved = [socket.username, ...data.attendees];
            involved.forEach(u => io.to(u).emit('event refresh'));
        });
    });

    socket.on('rsvp event', (data) => {
        pool.query(`UPDATE event_attendees SET status = $1 WHERE event_id = $2 AND username = $3`, [data.status, data.eventId, socket.username], (err) => {
            if (!err) {
                pool.query(`SELECT username FROM event_attendees WHERE event_id = $1`, [data.eventId], (err, res) => {
                    if (!err && res) {
                        res.rows.forEach(r => io.to(r.username).emit('event refresh'));
                        pool.query(`SELECT title, organizer FROM events WHERE id = $1`, [data.eventId], (err, evRes) => {
                            const row = evRes && evRes.rows.length > 0 ? evRes.rows[0] : null;
                            if (row) {
                                io.to(row.organizer).emit('event refresh');
                                io.to(row.organizer).emit('rsvp notification', { attendee: socket.username, status: data.status, title: row.title });
                            }
                        });
                    }
                });
            }
        });
    });

    socket.on('cancel event', (eventId) => {
        pool.query(`SELECT title, organizer FROM events WHERE id = $1`, [eventId], (err, res) => {
            const row = res && res.rows.length > 0 ? res.rows[0] : null;
            if (row && row.organizer === socket.username) {
                pool.query(`SELECT username FROM event_attendees WHERE event_id = $1`, [eventId], (err, attntRes) => {
                    pool.query(`DELETE FROM events WHERE id = $1`, [eventId]);
                    pool.query(`DELETE FROM event_attendees WHERE event_id = $1`, [eventId]);
                    if (!err && attntRes) {
                        attntRes.rows.forEach(r => {
                            io.to(r.username).emit('meeting cancelled', { title: row.title, organizer: socket.username });
                            io.to(r.username).emit('event refresh');
                        });
                        socket.emit('event refresh');
                    }
                });
            }
        });
    });

    socket.on('disconnect', () => {
        const activeUsers = Array.from(io.sockets.sockets.values()).map(s => s.username).filter(Boolean);
        io.emit('global presence', activeUsers);
    });
});

// Helper parsing function to protect UI side from structural alterations due to database switch
function formatMessageRow(row) {
    let rawTimestamp = row.timestamp;
    // Postgres Date object to UTC string expected format fallback
    if (rawTimestamp instanceof Date) {
        rawTimestamp = rawTimestamp.toISOString().replace('T', ' ').substring(0, 19);
    }
    
    return {
        id: row.id, 
        user: row.user, 
        text: row.text, 
        room: row.room,
        file: row.file_name ? { name: row.file_name, type: row.file_type, data: row.file_data } : null,
        replyTo: row.reply_to_id ? { id: row.reply_to_id, user: row.reply_to_user, text: row.reply_to_text } : null,
        reactions: typeof row.reactions === 'string' ? JSON.parse(row.reactions || '{"👍":[],"👎":[],"❤️":[],"✅":[],"👀":[]}') : (row.reactions || {"👍":[],"👎":[],"❤️":[],"✅":[],"👀":[]}),
        timestamp: rawTimestamp,
        is_deleted: row.is_deleted,
        is_pinned: row.is_pinned,
        deleted_for: typeof row.deleted_for === 'string' ? JSON.parse(row.deleted_for || '[]') : (row.deleted_for || [])
    };
}

const PORT = 3000;
server.listen(PORT, () => { console.log(`Server listening on http://localhost:${PORT}`); });