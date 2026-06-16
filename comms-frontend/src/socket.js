import { io } from 'socket.io-client';

// Connect to your Phase 2 Headless Node Server (Running in Terminal 1)
const URL = 'http://localhost:3000'; 
const socket = io(URL, { autoConnect: false });

export default socket;