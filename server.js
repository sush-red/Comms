const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Database Initialization
const db = new sqlite3.Database('./chat.db', (err) => {
    if (err) console.error("Database Error:", err.message);
    else console.log("Connected to SQLite Database.");
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, room TEXT, user TEXT, text TEXT,
        file_name TEXT, file_type TEXT, file_data TEXT,
        reply_to_id TEXT, reply_to_user TEXT, reply_to_text TEXT,
        reactions TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS custom_channels (name TEXT PRIMARY KEY, members TEXT)`);
});

io.on('connection', (socket) => {
    console.log('A user connected!');

    socket.on('login', (data) => {
        socket.username = data.username;
        socket.role = data.role;
        socket.join(data.username); 

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

    // UPGRADED: Pagination support (LIMIT 50)
    socket.on('join room', (data) => {
        const roomToJoin = data.room;
        socket.currentRoom = roomToJoin;

        Array.from(socket.rooms).forEach(room => {
            if (room !== socket.id && room !== socket.username) socket.leave(room);
        });
        socket.join(roomToJoin);

        db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp DESC LIMIT 50", [roomToJoin], (err, rows) => {
            if (err) return console.error(err);
            // Reverse so oldest is at the top of the batch
            const history = rows.reverse().map(formatMessageRow);
            socket.emit('chat history', history);
        });
    });

    // NEW: Load older messages when scrolling up
    socket.on('load more messages', (data) => {
        db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp DESC LIMIT 50 OFFSET ?", [data.room, data.offset], (err, rows) => {
            if (err || rows.length === 0) return;
            const olderHistory = rows.reverse().map(formatMessageRow);
            socket.emit('older messages', olderHistory);
        });
    });

    // NEW: Enterprise Search Query
    socket.on('search messages', (query) => {
        const searchQuery = `%${query}%`;
        db.all("SELECT * FROM messages WHERE text LIKE ? ORDER BY timestamp DESC LIMIT 20", [searchQuery], (err, rows) => {
            if (err) return;
            const results = rows.map(formatMessageRow);
            socket.emit('search results', results);
        });
    });

    // NEW: Typing Indicators
    socket.on('typing', (data) => { socket.to(data.room).emit('user typing', data.username); });
    socket.on('stop typing', (data) => { socket.to(data.room).emit('user stopped typing', data.username); });

    socket.on('create custom channel', (data) => {
        const { name, members } = data;
        db.run("INSERT OR IGNORE INTO custom_channels (name, members) VALUES (?, ?)", [name, JSON.stringify(members)], (err) => {
            if (!err) members.forEach(member => io.to(member).emit('new custom channel', name));
        });
    });

    socket.on('chat message', (data) => {
        data.id = Math.random().toString(36).substr(2, 9);
        data.reactions = { '👍': [], '👎': [], '❤️': [], '✅': [], '👀': [] };
        
        io.to(data.room).emit('chat message', data);

        const file = data.file || {};
        const reply = data.replyTo || {};
        db.run(`INSERT INTO messages (id, room, user, text, file_name, file_type, file_data, reply_to_id, reply_to_user, reply_to_text, reactions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [data.id, data.room, data.user, data.text, file.name, file.type, file.data, reply.id, reply.user, reply.text, JSON.stringify(data.reactions)]);

        // Broadcast unread alerts (skipping the sender)
        if (data.room.startsWith('DM-')) {
            const users = data.room.replace('DM-', '').split('-');
            users.forEach(u => { if (u !== data.user) io.to(u).emit('unread alert', data); });
        } else {
            db.get("SELECT members FROM custom_channels WHERE name = ?", [data.room], (err, row) => {
                if (row) {
                    JSON.parse(row.members).forEach(u => { if (u !== data.user) io.to(u).emit('unread alert', data); });
                } else {
                    socket.broadcast.emit('unread alert', data);
                }
            });
        }
    });

    socket.on('add reaction', (reactionData) => {
        db.get("SELECT reactions FROM messages WHERE id = ?", [reactionData.msgId], (err, row) => {
            if (err || !row) return;
            let reactions = JSON.parse(row.reactions);
            let usersArray = reactions[reactionData.emoji];
            const userIndex = usersArray.indexOf(reactionData.username);
            if (userIndex === -1) usersArray.push(reactionData.username);
            else usersArray.splice(userIndex, 1);

            db.run("UPDATE messages SET reactions = ? WHERE id = ?", [JSON.stringify(reactions), reactionData.msgId], (err) => {
                if (!err) {
                    io.to(reactionData.roomId).emit('update reaction', {
                        msgId: reactionData.msgId, emoji: reactionData.emoji, users: usersArray
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

function formatMessageRow(row) {
    return {
        id: row.id, user: row.user, text: row.text, room: row.room,
        file: row.file_name ? { name: row.file_name, type: row.file_type, data: row.file_data } : null,
        replyTo: row.reply_to_id ? { id: row.reply_to_id, user: row.reply_to_user, text: row.reply_to_text } : null,
        reactions: JSON.parse(row.reactions || '{"👍":[],"👎":[],"❤️":[],"✅":[],"👀":[]}'),
        timestamp: row.timestamp
    };
}

const PORT = 3000;
server.listen(PORT, () => { console.log(`Server listening on http://localhost:${PORT}`); });