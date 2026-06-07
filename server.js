const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Simulate a database using Mac's memory
const databaseSimulator = {
    'General': [],
    'Management': [],
    'Engineering': [],
    'Scrum-Daily': []
};

io.on('connection', (socket) => {
    console.log('A user connected!');

    socket.on('join room', (roomToJoin) => {
        Array.from(socket.rooms).forEach(room => {
            if (room !== socket.id) socket.leave(room);
        });
        
        socket.join(roomToJoin);
        console.log(`User joined room: ${roomToJoin}`);

        socket.emit('chat history', databaseSimulator[roomToJoin]);
    });

    socket.on('chat message', (data) => {
        data.id = Math.random().toString(36).substr(2, 9);
        // UPGRADE: We now store empty ARRAYS instead of numbers to hold usernames
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
                // Get the array of users who clicked this specific emoji
                const usersArray = message.reactions[reactionData.emoji];
                
                // Check if the user who clicked is already in the array
                const userIndex = usersArray.indexOf(reactionData.username);

                // TOGGLE LOGIC: If they aren't in the list, add them. If they are, remove them.
                if (userIndex === -1) {
                    usersArray.push(reactionData.username);
                } else {
                    usersArray.splice(userIndex, 1);
                }
                
                // Broadcast the updated array of users to everyone
                io.to(reactionData.roomId).emit('update reaction', {
                    msgId: reactionData.msgId,
                    emoji: reactionData.emoji,
                    users: message.reactions[reactionData.emoji]
                });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});