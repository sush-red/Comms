const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// ADDITION 1: Simulate a database using Mac's memory
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

        // ADDITION 2: Instantly send the room's history to the user who just joined
        socket.emit('chat history', databaseSimulator[roomToJoin]);
    });

    socket.on('chat message', (data) => {
        // ADDITION 3: Save the message to our "database" before broadcasting
        if (databaseSimulator[data.room]) {
            databaseSimulator[data.room].push(data);
        }
        io.to(data.room).emit('chat message', data);
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});