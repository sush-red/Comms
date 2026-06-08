const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

const databaseSimulator = {
    'General': [],
    'Management': [],
    'Engineering': [],
    'Scrum-Daily': []
};

const roomUsers = {
    'General': [],
    'Management': [],
    'Engineering': [],
    'Scrum-Daily': []
};

// NEW: Track custom channels and their assigned members
const customChannels = {}; 

io.on('connection', (socket) => {
    console.log('A user connected!');

    // UPGRADED: Dedicated Login Event
    socket.on('login', (data) => {
        socket.username = data.username;
        socket.role = data.role;
        
        // Join a "Personal Room" so the server can send this specific user DM alerts anywhere
        socket.join(data.username);

        // Find any private custom channels this user was granted access to
        const myCustomChannels = Object.keys(customChannels).filter(ch => customChannels[ch].includes(data.username));
        socket.emit('login success', { customChannels: myCustomChannels });

        // Update the global active users list for the @mention dropdown
        const activeUsers = Array.from(io.sockets.sockets.values()).map(s => s.username).filter(Boolean);
        io.emit('room users', activeUsers);
    });

    socket.on('join room', (data) => {
        const roomToJoin = data.room;
        const username = data.username;
        socket.currentRoom = roomToJoin;

        // Leave other channel rooms (but keep the Personal Room!)
        Array.from(socket.rooms).forEach(room => {
            if (room !== socket.id && room !== username) {
                socket.leave(room);
            }
        });
        
        socket.join(roomToJoin);

        if (!databaseSimulator[roomToJoin]) databaseSimulator[roomToJoin] = [];
        
        socket.emit('chat history', databaseSimulator[roomToJoin]);
    });

    // NEW: Handle Admin Channel Creation
    socket.on('create custom channel', (data) => {
        const { name, members } = data;
        customChannels[name] = members;
        databaseSimulator[name] = [];
        
        // Instantly notify the selected members that they have a new channel
        members.forEach(member => {
            io.to(member).emit('new custom channel', name);
        });
    });

    socket.on('chat message', (data) => {
        data.id = Math.random().toString(36).substr(2, 9);
        data.reactions = { '👍': [], '👎': [], '❤️': [], '✅': [], '👀': [] };
        
        if (!databaseSimulator[data.room]) databaseSimulator[data.room] = [];
        databaseSimulator[data.room].push(data);
        
        // 1. Broadcast to users ACTIVELY looking at the channel
        io.to(data.room).emit('chat message', data);

        // 2. Broadcast Unread Alerts to users NOT looking at the channel
        if (data.room.startsWith('DM-')) {
            const users = data.room.replace('DM-', '').split('-');
            users.forEach(u => {
                // Send an alert directly to their Personal Room
                io.to(u).emit('unread alert', data);
            });
        } else {
            // For channels, send an alert. (If it's a custom channel, only alert the members)
            if (customChannels[data.room]) {
                customChannels[data.room].forEach(u => {
                    io.to(u).emit('unread alert', data);
                });
            } else {
                // Public channel: alert everyone
                io.emit('unread alert', data);
            }
        }
    });

    socket.on('add reaction', (reactionData) => {
        const roomHistory = databaseSimulator[reactionData.roomId];
        if (roomHistory) {
            const message = roomHistory.find(msg => msg.id === reactionData.msgId);
            if (message) {
                const usersArray = message.reactions[reactionData.emoji];
                const userIndex = usersArray.indexOf(reactionData.username);

                if (userIndex === -1) {
                    usersArray.push(reactionData.username);
                } else {
                    usersArray.splice(userIndex, 1);
                }
                
                io.to(reactionData.roomId).emit('update reaction', {
                    msgId: reactionData.msgId,
                    emoji: reactionData.emoji,
                    users: message.reactions[reactionData.emoji]
                });
            }
        }
    });

    socket.on('disconnect', () => {
        const activeUsers = Array.from(io.sockets.sockets.values()).map(s => s.username).filter(Boolean);
        io.emit('room users', activeUsers);
        console.log('A user disconnected');
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});