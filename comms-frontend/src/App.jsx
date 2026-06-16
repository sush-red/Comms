import { useState, useEffect } from 'react';
import socket from './socket';

// Placeholder components (we will build these out fully next)
const LoginScreen = ({ onLogin }) => (
  <div className="flex h-screen items-center justify-center bg-background">
    <button onClick={() => onLogin('Sushanth', 'admin')} className="bg-primary text-white p-4 rounded font-bold hover:bg-primary/90 transition-colors shadow-md">
      Quick Login as Admin
    </button>
  </div>
);

const Sidebar = ({ setView }) => (
  <div className="w-64 bg-sidebar-bg text-white flex flex-col p-4">
    <h1 className="text-xl font-bold mb-8">Comms Pro</h1>
    <button onClick={() => setView('chat')} className="mb-2 bg-primary/20 p-2 rounded text-sm font-bold text-left hover:bg-primary/40 transition-colors">💬 Chat</button>
    <button onClick={() => setView('calendar')} className="bg-primary/20 p-2 rounded text-sm font-bold text-left hover:bg-primary/40 transition-colors">📅 Calendar</button>
  </div>
);

const ChatView = () => <div className="flex-1 bg-background p-6 text-on-surface">Chat UI goes here</div>;
const CalendarView = () => <div className="flex-1 bg-surface-container-lowest p-6 text-on-surface">Calendar UI goes here</div>;

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('chat');

  useEffect(() => {
    // Listen for global socket events here
    socket.on('login success', (data) => {
      setIsLoggedIn(true);
      console.log("Logged in! Rooms:", data);
    });

    return () => {
      socket.off('login success');
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
    <div className="flex h-screen font-sans">
      <Sidebar setView={setCurrentView} />
      {currentView === 'chat' ? <ChatView /> : <CalendarView />}
    </div>
  );
}

export default App;