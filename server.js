const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose(); // NEW: Require SQLite

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// ==========================================
// DATABASE INITIALIZATION
// ==========================================
// This creates a file named 'chat.db' in your folder. 
// If it exists, it safely connects to it without deleting your old data.
const db = new sqlite3.Database('./chat.db', (err) => {
    if (err) console.error("Database Error:", err.message);
    else console.log("Connected to SQLite Database.");
});

db.serialize(() => {
    // Table for Messages and Attachments
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room TEXT,
        user TEXT,
        text TEXT,
        file_name TEXT,
        file_type TEXT,
        file_data TEXT,
        reply_to_id TEXT,
        reply_to_user TEXT,
        reply_to_text TEXT,
        reactions TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Table for Admin-Created Channels
    db.run(`CREATE TABLE IF NOT EXISTS custom_channels (
        name TEXT PRIMARY KEY,
        members TEXT
    )`);
});

// ==========================================
// SOCKET.IO REAL-TIME ENGINE
// ==========================================
io.on('connection', (socket) => {
    console.log('A user connected!');

    socket.on('login', (data) => {
        socket.username = data.username;
        socket.role = data.role;
        socket.join(data.username); // Personal DM Room

        // Fetch custom channels from SQLite
        db.all("SELECT * FROM custom_channels", [], (err, rows) => {
            if (!err) {
                const myCustomChannels = rows
                    .filter(row => JSON.parse(row.members).includes(data.username))
                    .map(row => row.name);
                socket.emit('login success', { customChannels: myCustomChannels });
            }
        });

        const activeUsers = Array.from(io.sockets.sockets.values()).map(s => s.username).filter(Boolean);
        io.emit('room users', activeUsers);
    });

    socket.on('join room', (data) => {
        const roomToJoin = data.room;
        const username = data.username;
        socket.currentRoom = roomToJoin;

        Array.from(socket.rooms).forEach(room => {
            if (room !== socket.id && room !== username) socket.leave(room);
        });
        
        socket.join(roomToJoin);

        // Fetch Room History from SQLite
        db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC", [roomToJoin], (err, rows) => {
            if (err) return console.error(err);
            
            // Rebuild the data object exactly how the frontend expects it
            const history = rows.map(row => ({
                id: row.id,
                user: row.user,
                text: row.text,
                room: row.room,
                file: row.file_name ? { name: row.file_name, type: row.file_type, data: row.file_data } : null,
                replyTo: row.reply_to_id ? { id: row.reply_to_id, user: row.reply_to_user, text: row.reply_to_text } : null,
                reactions: JSON.parse(row.reactions || '{"👍":[],"👎":[],"❤️":[],"✅":[],"👀":[]}')
            }));
            
            socket.emit('chat history', history);
        });
    });

    socket.on('create custom channel', (data) => {
        const { name, members } = data;
        
        // Save channel to SQLite
        db.run("INSERT OR IGNORE INTO custom_channels (name, members) VALUES (?, ?)", [name, JSON.stringify(members)], (err) => {
            if (!err) {
                members.forEach(member => {
                    io.to(member).emit('new custom channel', name);
                });
            }
        });
    });

    socket.on('chat message', (data) => {
        data.id = Math.random().toString(36).substr(2, 9);
        data.reactions = { '👍': [], '👎': [], '❤️': [], '✅': [], '👀': [] };
        
        // 1. OPTIMISTIC UI: Broadcast instantly for zero lag
        io.to(data.room).emit('chat message', data);

        // 2. BACKGROUND SAVE: Write to SQLite
        const file = data.file || {};
        const reply = data.replyTo || {};
        
        db.run(`INSERT INTO messages (id, room, user, text, file_name, file_type, file_data, reply_to_id, reply_to_user, reply_to_text, reactions) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [data.id, data.room, data.user, data.text, file.name, file.type, file.data, reply.id, reply.user, reply.text, JSON.stringify(data.reactions)]);

        // 3. UNREAD ALERTS
        if (data.room.startsWith('DM-')) {
            const users = data.room.replace('DM-', '').split('-');
            users.forEach(u => io.to(u).emit('unread alert', data));
        } else {
            db.get("SELECT members FROM custom_channels WHERE name = ?", [data.room], (err, row) => {
                if (row) {
                    const members = JSON.parse(row.members);
                    members.forEach(u => io.to(u).emit('unread alert', data));
                } else {
                    io.emit('unread alert', data);
                }
            });
        }
    });

    socket.on('add reaction', (reactionData) => {
        // Fetch current reactions from SQLite, update, and save back
        db.get("SELECT reactions FROM messages WHERE id = ?", [reactionData.msgId], (err, row) => {
            if (err || !row) return;
            
            let reactions = JSON.parse(row.reactions);
            let usersArray = reactions[reactionData.emoji];
            const userIndex = usersArray.indexOf(reactionData.username);

            if (userIndex === -1) {
                usersArray.push(reactionData.username);
            } else {
                usersArray.splice(userIndex, 1);
            }

            db.run("UPDATE messages SET reactions = ? WHERE id = ?", [JSON.stringify(reactions), reactionData.msgId], (err) => {
                if (!err) {
                    io.to(reactionData.roomId).emit('update reaction', {
                        msgId: reactionData.msgId,
                        emoji: reactionData.emoji,
                        users: usersArray
                    });
                }
            });
        });
    });

    socket.on('disconnect', () => {
        const activeUsers = Array.from(io.sockets.sockets.values()).map(s => s.username).filter(Boolean);
        io.emit('room users', activeUsers);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});