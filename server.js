const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Simulate a database for Messages
const databaseSimulator = {
    'General': [],
    'Management': [],
    'Engineering': [],
    'Scrum-Daily': []
};

// NEW: Simulate an active memory state for Online Users
const roomUsers = {
    'General': [],
    'Management': [],
    'Engineering': [],
    'Scrum-Daily': []
};

io.on('connection', (socket) => {
    console.log('A user connected!');

    // UPGRADED: Join room now expects an object with {room, username}
    socket.on('join room', (data) => {
        const roomToJoin = data.room;
        const username = data.username;

        // Attach user info to the socket itself for tracking
        socket.username = username;
        socket.currentRoom = roomToJoin;

        // Clean up old rooms
        Array.from(socket.rooms).forEach(room => {
            if (room !== socket.id) {
                socket.leave(room);
                // Remove user from the old room's active list
                if (roomUsers[room]) {
                    roomUsers[room] = roomUsers[room].filter(u => u !== username);
                    io.to(room).emit('room users', roomUsers[room]);
                }
            }
        });
        
        socket.join(roomToJoin);

        // Add user to the new room's active list
        if (roomUsers[roomToJoin] && username !== "Anonymous") {
            if (!roomUsers[roomToJoin].includes(username)) {
                roomUsers[roomToJoin].push(username);
            }
        }

        // Send history and the updated live user list
        socket.emit('chat history', databaseSimulator[roomToJoin]);
        io.to(roomToJoin).emit('room users', roomUsers[roomToJoin]);
    });

    socket.on('chat message', (data) => {
        data.id = Math.random().toString(36).substr(2, 9);
        data.reactions = { '👍': [], '👎': [], '❤️': [], '✅': [], '👀': [] };
        
        if (databaseSimulator[data.room]) {
            databaseSimulator[data.room].push(data);
        }
        io.to(data.room).emit('chat message', data);
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

    // NEW: Handle user closing the tab
    socket.on('disconnect', () => {
        if (socket.currentRoom && socket.username) {
            roomUsers[socket.currentRoom] = roomUsers[socket.currentRoom].filter(u => u !== socket.username);
            io.to(socket.currentRoom).emit('room users', roomUsers[socket.currentRoom]);
        }
        console.log('A user disconnected');
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});