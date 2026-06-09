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

const db = new sqlite3.Database('./chat.db', (err) => {
    if (err) console.error("Database Error:", err.message);
    else console.log("Connected to SQLite Database.");
});

db.serialize(() => {
    // Existing Tables
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, room TEXT, user TEXT, text TEXT,
        file_name TEXT, file_type TEXT, file_data TEXT,
        reply_to_id TEXT, reply_to_user TEXT, reply_to_text TEXT,
        reactions TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS custom_channels (name TEXT PRIMARY KEY, members TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, role TEXT)`);
    
    // Non-destructive migrations
    db.run(`ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE messages ADD COLUMN is_pinned INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE messages ADD COLUMN deleted_for TEXT DEFAULT '[]'`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN contact TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN status_msg TEXT DEFAULT 'Available'`, () => {});

    // NEW: Calendar Tables
    db.run(`CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, title TEXT, start_time TEXT, end_time TEXT, description TEXT, organizer TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS event_attendees (
        event_id TEXT, username TEXT, status TEXT
    )`);
});

io.on('connection', (socket) => {
    // --- EXISTING CHAT LOGIC ---
    socket.on('login', (data) => {
        socket.username = data.username;
        socket.role = data.role;
        socket.join(data.username); 

        db.run("INSERT OR IGNORE INTO users (username, role) VALUES (?, ?)", [data.username, data.role]);

        db.all("SELECT * FROM custom_channels", [], (err, rows) => {
            if (!err) {
                const myCustomChannels = rows
                    .filter(row => JSON.parse(row.members).includes(data.username))
                    .map(row => row.name);
                socket.emit('login success', { customChannels: myCustomChannels });
            }
        });

        const activeUsers = Array.from(io.sockets.sockets.values()).map(s => s.username).filter(Boolean);
        io.emit('global presence', activeUsers);
    });

    socket.on('join room', (data) => {
        const roomToJoin = data.room;
        socket.currentRoom = roomToJoin;

        Array.from(socket.rooms).forEach(room => {
            if (room !== socket.id && room !== socket.username) socket.leave(room);
        });
        socket.join(roomToJoin);

        db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp DESC LIMIT 50", [roomToJoin], (err, rows) => {
            if (err) return console.error(err);
            const history = rows.reverse().map(formatMessageRow).filter(msg => !msg.deleted_for.includes(socket.username));
            socket.emit('chat history', history);
        });

        if (roomToJoin.startsWith('DM-')) {
            const mentionable = roomToJoin.replace('DM-', '').split('-');
            socket.emit('room directory', mentionable);
        } else {
            db.get("SELECT members FROM custom_channels WHERE name = ?", [roomToJoin], (err, row) => {
                if (row) socket.emit('room directory', JSON.parse(row.members));
                else {
                    db.all("SELECT username FROM users", [], (err, rows) => {
                        if (!err) io.to(roomToJoin).emit('room directory', rows.map(r => r.username));
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

    socket.on('delete message', (data) => {
        db.get("SELECT timestamp, user FROM messages WHERE id = ?", [data.msgId], (err, row) => {
            if (err || !row) return;
            if (row.user !== socket.username && socket.role !== 'admin' && socket.role !== 'central') return;
            const msgTime = new Date(row.timestamp + 'Z').getTime();
            if (Date.now() - msgTime <= 30 * 60 * 1000) {
                db.run("UPDATE messages SET is_deleted = 1 WHERE id = ?", [data.msgId], (err) => {
                    if (!err) io.to(data.room).emit('message deleted', data.msgId);
                });
            }
        });
    });

    socket.on('delete for me', (data) => {
        db.get("SELECT deleted_for FROM messages WHERE id = ?", [data.msgId], (err, row) => {
            if (err || !row) return;
            let deletedForArray = JSON.parse(row.deleted_for || '[]');
            if (!deletedForArray.includes(socket.username)) {
                deletedForArray.push(socket.username);
                db.run("UPDATE messages SET deleted_for = ? WHERE id = ?", [JSON.stringify(deletedForArray), data.msgId], (err) => {
                    if (!err) socket.emit('message deleted for me', data.msgId);
                });
            }
        });
    });

    socket.on('toggle pin', (data) => {
        db.get("SELECT is_pinned FROM messages WHERE id = ?", [data.msgId], (err, row) => {
            if (err || !row) return;
            const newStatus = row.is_pinned ? 0 : 1;
            db.run("UPDATE messages SET is_pinned = ? WHERE id = ?", [newStatus, data.msgId], (err) => {
                if (!err) io.to(data.room).emit('update pin', { msgId: data.msgId, isPinned: newStatus, msgData: data.msgData });
            });
        });
    });

    socket.on('load more messages', (data) => {
        db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp DESC LIMIT 50 OFFSET ?", [data.room, data.offset], (err, rows) => {
            if (err || rows.length === 0) return;
            const olderHistory = rows.reverse().map(formatMessageRow).filter(msg => !msg.deleted_for.includes(socket.username));
            socket.emit('older messages', olderHistory);
        });
    });

    socket.on('search messages', (query) => {
        const searchQuery = `%${query}%`;
        db.all("SELECT * FROM messages WHERE text LIKE ? AND is_deleted = 0 ORDER BY timestamp DESC LIMIT 20", [searchQuery], (err, rows) => {
            if (!err) {
                const results = rows.map(formatMessageRow).filter(msg => !msg.deleted_for.includes(socket.username));
                socket.emit('search results', results);
            }
        });
    });

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

        if (data.room.startsWith('DM-')) {
            const users = data.room.replace('DM-', '').split('-');
            users.forEach(u => { if (u !== data.user) io.to(u).emit('unread alert', data); });
        } else {
            db.get("SELECT members FROM custom_channels WHERE name = ?", [data.room], (err, row) => {
                if (row) JSON.parse(row.members).forEach(u => { if (u !== data.user) io.to(u).emit('unread alert', data); });
                else socket.broadcast.emit('unread alert', data);
            });
        }
    });

    socket.on('add reaction', (reactionData) => {
        db.get("SELECT reactions FROM messages WHERE id = ?", [reactionData.msgId], (err, row) => {
            if (err || !row) return;
            let reactions = JSON.parse(row.reactions);
            let usersArray = reactions[reactionData.emoji];
            if (!usersArray) return; 
            const userIndex = usersArray.indexOf(reactionData.username);
            if (userIndex === -1) usersArray.push(reactionData.username);
            else usersArray.splice(userIndex, 1);
            db.run("UPDATE messages SET reactions = ? WHERE id = ?", [JSON.stringify(reactions), reactionData.msgId], (err) => {
                if (!err) io.to(reactionData.roomId).emit('update reaction', { msgId: reactionData.msgId, emoji: reactionData.emoji, users: usersArray });
            });
        });
    });

    socket.on('get profile', (targetUser) => {
        db.get("SELECT username, role, email, contact, status_msg FROM users WHERE username = ?", [targetUser], (err, row) => {
            if (row) socket.emit('profile data', row);
        });
    });

    socket.on('update profile', (data) => {
        if (socket.username !== data.username) return;
        db.run("UPDATE users SET email = ?, contact = ?, status_msg = ? WHERE username = ?", 
            [data.email, data.contact, data.status_msg, data.username], (err) => {
                if (!err) socket.emit('profile updated successfully');
            });
    });

    // --- NEW: CALENDAR LOGIC ---
    socket.on('get events', () => {
        // Fetch events where user is organizer OR an attendee
        const query = `
            SELECT e.*, 
                   (SELECT json_group_array(json_object('username', ea.username, 'status', ea.status)) 
                    FROM event_attendees ea WHERE ea.event_id = e.id) as attendees
            FROM events e
            WHERE e.organizer = ? OR e.id IN (SELECT event_id FROM event_attendees WHERE username = ?)
        `;
        db.all(query, [socket.username, socket.username], (err, rows) => {
            if (!err) socket.emit('events data', rows);
        });
    });

    socket.on('create event', (data) => {
        const eventId = Math.random().toString(36).substr(2, 9);
        db.run(`INSERT INTO events (id, title, start_time, end_time, description, organizer) VALUES (?, ?, ?, ?, ?, ?)`,
            [eventId, data.title, data.startTime, data.endTime, data.description, socket.username], (err) => {
            if (err) return;
            
            data.attendees.forEach(attendee => {
                db.run(`INSERT INTO event_attendees (event_id, username, status) VALUES (?, ?, ?)`, [eventId, attendee, 'pending']);
            });

            // Notify all involved users to refetch their calendar
            const involved = [socket.username, ...data.attendees];
            involved.forEach(u => io.to(u).emit('event refresh'));
        });
    });

    socket.on('rsvp event', (data) => {
        db.run(`UPDATE event_attendees SET status = ? WHERE event_id = ? AND username = ?`, [data.status, data.eventId, socket.username], (err) => {
            if (!err) {
                // Notify users in this event to refresh
                db.all(`SELECT username FROM event_attendees WHERE event_id = ?`, [data.eventId], (err, rows) => {
                    if (!err) {
                        rows.forEach(r => io.to(r.username).emit('event refresh'));
                        db.get(`SELECT organizer FROM events WHERE id = ?`, [data.eventId], (err, row) => {
                            if (row) io.to(row.organizer).emit('event refresh');
                        });
                    }
                });
            }
        });
    });

    socket.on('cancel event', (eventId) => {
        db.get(`SELECT organizer FROM events WHERE id = ?`, [eventId], (err, row) => {
            if (row && row.organizer === socket.username) {
                db.all(`SELECT username FROM event_attendees WHERE event_id = ?`, [eventId], (err, rows) => {
                    db.run(`DELETE FROM events WHERE id = ?`, [eventId]);
                    db.run(`DELETE FROM event_attendees WHERE event_id = ?`, [eventId]);
                    if (!err && rows) {
                        rows.forEach(r => io.to(r.username).emit('event refresh'));
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

function formatMessageRow(row) {
    return {
        id: row.id, user: row.user, text: row.text, room: row.room,
        file: row.file_name ? { name: row.file_name, type: row.file_type, data: row.file_data } : null,
        replyTo: row.reply_to_id ? { id: row.reply_to_id, user: row.reply_to_user, text: row.reply_to_text } : null,
        reactions: JSON.parse(row.reactions || '{"👍":[],"👎":[],"❤️":[],"✅":[],"👀":[]}'),
        timestamp: row.timestamp,
        is_deleted: row.is_deleted,
        is_pinned: row.is_pinned,
        deleted_for: JSON.parse(row.deleted_for || '[]')
    };
}

const PORT = 3000;
server.listen(PORT, () => { console.log(`Server listening on http://localhost:${PORT}`); });