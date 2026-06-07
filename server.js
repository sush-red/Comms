// 1. Import the tools we just installed
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// 2. Initialize the app and server engines
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 3. Define what happens when someone visits the homepage
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// 4. Listen for real-time WebSocket connections from employees
io.on('connection', (socket) => {
    console.log('A user connected!');

    // When the server hears a "chat message" from a user
    socket.on('chat message', (msg) => {
        // Broadcast that exact message to EVERYONE connected
        io.emit('chat message', msg);
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// 5. Start the server on Port 3000
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});