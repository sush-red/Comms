import { useState, useEffect } from 'react';
import socket from './socket';
import ChatView from './components/ChatView';
import Sidebar from './components/Sidebar';
import CalendarView from './components/CalendarView';

// 1. The Login Screen Component
const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('user');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) onLogin(username.trim(), role);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="bg-surface-container-lowest p-8 rounded-xl shadow-lg w-full max-w-md border border-border-subtle relative">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-primary-container/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-2xl">🔒</span></div>
          <h2 className="text-2xl font-bold mb-2 text-on-surface">Comms Pro</h2>
          <p className="text-on-surface-variant text-sm">Sign in to your workspace.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="Enter your full name..." value={username} onChange={(e) => setUsername(e.target.value)} className="w-full p-3 border border-border-subtle rounded-lg bg-surface-container-low focus:border-primary outline-none transition-colors" autoComplete="off" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full p-3 border border-border-subtle rounded-lg bg-surface-container-low focus:border-primary outline-none transition-colors">
            <option value="user">Standard User</option>
            <option value="admin">Project Admin</option>
            <option value="central">Central Admin</option>
          </select>
          <button type="submit" className="w-full bg-primary text-white p-3 rounded-lg hover:bg-primary/90 transition-colors font-bold shadow-sm mt-2">Join</button>
        </form>
      </div>
    </div>
  );
};


// 2. The Main App Wrapper
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('chat');
  const [currentRoom, setCurrentRoom] = useState('General');
  
  const [channels, setChannels] = useState(['General']);
  const [dms, setDms] = useState([]);

  useEffect(() => {
    socket.on('login success', (data) => {
      setIsLoggedIn(true);
      if (data.customChannels) {
        setChannels(['General', ...data.customChannels]);
      }
      if (data.dmRooms) {
        setDms(data.dmRooms);
      }
    });

    // Listen for newly created channels while logged in
    socket.on('new custom channel', (channelName) => {
      setChannels(prev => prev.includes(channelName) ? prev : [...prev, channelName]);
    });

    return () => {
      socket.off('login success');
      socket.off('new custom channel');
    };
  }, []);

  const handleLogin = (username, role) => {
    setUser({ username, role });
    socket.connect();
    socket.emit('login', { username, role });
  };

  if (!isLoggedIn) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen font-sans overflow-hidden bg-background">
      <Sidebar 
        setView={setCurrentView} 
        activeView={currentView}
        currentRoom={currentRoom}
        setCurrentRoom={setCurrentRoom}
        channels={channels}
        dms={dms}
        currentUser={user}
      />
      
      {currentView === 'chat' ? (
        <ChatView currentRoom={currentRoom} currentUser={user} />
      ) : (
        <CalendarView currentUser={user} />
      )}
    </div>
  );
}

export default App;