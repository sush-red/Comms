import { useState, useEffect } from 'react';
import socket from './socket';
import ChatView from './components/ChatView';
import Sidebar from './components/Sidebar';
import CalendarView from './components/CalendarView';

const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('user');
  
  const handleSubmit = (e) => { 
    e.preventDefault(); 
    if (username.trim()) onLogin(username.trim(), role); 
  };
  
  return (
    <div className="flex h-screen items-center justify-center bg-background p-4 text-on-surface">
      <div className="bg-surface-container-lowest p-8 rounded-xl shadow-lg w-full max-w-md border border-outline-variant/30">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4 text-2xl border border-primary/20">🔒</div>
          <h2 className="text-2xl font-bold mb-2">Comms Pro</h2>
          <p className="text-sm text-on-surface-variant">Enterprise Workspace</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="text" 
            placeholder="Enter your full name..." 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            className="w-full p-3 border border-outline-variant/30 bg-surface-container rounded-lg outline-primary placeholder:text-on-surface-variant" 
            required 
          />
          <select 
            value={role} 
            onChange={e => setRole(e.target.value)} 
            className="w-full p-3 border border-outline-variant/30 bg-surface-container rounded-lg outline-primary"
          >
            <option value="user">Standard User</option>
            <option value="admin">Project Admin</option>
            <option value="central">Central Admin</option>
          </select>
          <button type="submit" className="w-full bg-primary text-on-primary p-3 rounded-lg font-bold shadow-md hover:opacity-90 transition-opacity">
            Join
          </button>
        </form>
      </div>
    </div>
  );
};

const ProfileView = ({ currentUser }) => {
  const [profile, setProfile] = useState({ email: '', contact: '', status_msg: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    socket.emit('get profile', currentUser.username);
    socket.on('profile data', data => setProfile(data || { email: '', contact: '', status_msg: '' }));
    socket.on('profile updated successfully', () => setMsg('Profile updated!'));
    
    return () => { 
      socket.off('profile data'); 
      socket.off('profile updated successfully'); 
    };
  }, [currentUser]);

  const handleUpdate = (e) => {
    e.preventDefault();
    socket.emit('update profile', { ...profile, username: currentUser.username });
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="flex-1 bg-background p-8 flex justify-center items-center text-on-surface">
      <div className="max-w-md w-full glass-panel rounded-xl p-6 shadow-lg">
        <h2 className="text-2xl font-bold mb-6 text-center">My Profile</h2>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-on-surface-variant block mb-1">Status Message</label>
            <input type="text" value={profile.status_msg} onChange={e => setProfile({...profile, status_msg: e.target.value})} className="w-full p-2 border border-outline-variant/30 bg-surface-container-low rounded outline-primary" />
          </div>
          <div>
            <label className="text-xs font-bold text-on-surface-variant block mb-1">Email</label>
            <input type="email" value={profile.email} onChange={e => setProfile({...profile, email: e.target.value})} className="w-full p-2 border border-outline-variant/30 bg-surface-container-low rounded outline-primary" />
          </div>
          <div>
            <label className="text-xs font-bold text-on-surface-variant block mb-1">Contact Number</label>
            <input type="text" value={profile.contact} onChange={e => setProfile({...profile, contact: e.target.value})} className="w-full p-2 border border-outline-variant/30 bg-surface-container-low rounded outline-primary" />
          </div>
          {msg && <div className="text-secondary text-sm text-center font-bold">{msg}</div>}
          <button type="submit" className="w-full bg-primary text-on-primary p-3 rounded font-bold shadow-md hover:opacity-90 mt-4">Save Changes</button>
        </form>
      </div>
    </div>
  );
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('chat');
  const [currentRoom, setCurrentRoom] = useState('General');
  
  const [channels, setChannels] = useState(['General']);
  const [dms, setDms] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  
  // Theme State (Defaulting to dark mode as per Stitch UI)
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Apply Tailwind dark mode class to root HTML tag
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.setProperty('--color-background', '#0f141b');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.setProperty('--color-background', '#fdfcff'); 
    }
  }, [isDarkMode]);

  useEffect(() => {
    socket.on('login success', (data) => {
      setIsLoggedIn(true);
      if (data.customChannels) setChannels(['General', ...data.customChannels]);
      if (data.dmRooms) setDms(data.dmRooms);
    });

    socket.on('all users list', (users) => setAllUsers(users));
    socket.on('new custom channel', (channelName) => setChannels(prev => prev.includes(channelName) ? prev : [...prev, channelName]));
    socket.on('user promoted', (promotedUser) => {
      if (user && user.username === promotedUser) setUser({ ...user, role: 'admin' });
    });
    
    socket.on('unread alert', (data) => {
      if (data.room !== currentRoom || currentView !== 'chat') {
        setUnreadCounts(prev => ({ ...prev, [data.room]: (prev[data.room] || 0) + 1 }));
      }
    });

    return () => {
      socket.off('login success'); 
      socket.off('all users list'); 
      socket.off('new custom channel'); 
      socket.off('user promoted'); 
      socket.off('unread alert');
    };
  }, [currentRoom, currentView, user]);

  const handleLogin = (username, role) => {
    setUser({ username, role }); 
    socket.connect(); 
    socket.emit('login', { username, role });
  };

  const clearUnread = (room) => setUnreadCounts(prev => ({ ...prev, [room]: 0 }));
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  if (!isLoggedIn) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="flex h-screen font-sans overflow-hidden bg-background text-on-surface transition-colors duration-300">
      <Sidebar 
        setView={setCurrentView} 
        activeView={currentView} 
        currentRoom={currentRoom} 
        setCurrentRoom={setCurrentRoom}
        channels={channels} 
        dms={dms} 
        currentUser={user} 
        allUsers={allUsers} 
        unreadCounts={unreadCounts} 
        clearUnread={clearUnread}
        toggleTheme={toggleTheme} 
        isDarkMode={isDarkMode}
      />
      
      {currentView === 'chat' ? (
        <ChatView currentRoom={currentRoom} currentUser={user} allUsers={allUsers} /> 
      ) : currentView === 'calendar' ? (
        <CalendarView currentUser={user} /> 
      ) : (
        <ProfileView currentUser={user} />
      )}
    </div>
  );
}

export default App;