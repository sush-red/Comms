import { useState, useEffect } from 'react';
import socket from './socket';
import ChatView from './components/ChatView';
import Sidebar from './components/Sidebar';
import CalendarView from './components/CalendarView';

export const playAudioAlert = (type) => {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator(); 
  const gainNode = audioCtx.createGain();
  
  if (type === 'mention') { oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime); oscillator.type = 'triangle'; } 
  else { oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); oscillator.type = 'sine'; }
  
  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); 
  oscillator.connect(gainNode); gainNode.connect(audioCtx.destination); 
  oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.15); 
};

const LoginScreen = ({ onLogin, errorMsg }) => {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('user');
  const handleSubmit = (e) => { e.preventDefault(); if (username.trim()) onLogin(username.trim(), role); };
  
  return (
    <div className="flex h-screen items-center justify-center bg-background p-4 text-on-surface">
      <div className="bg-surface-container-lowest p-8 rounded-xl shadow-lg w-full max-w-md border border-outline-variant/30">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🔒</div>
          <h2 className="text-2xl font-bold mb-2">Comms Pro</h2>
        </div>
        {errorMsg && <div className="bg-error-container text-error p-3 rounded mb-4 text-sm font-bold text-center">{errorMsg}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="Enter your full name..." value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 bg-surface-container rounded-lg outline-primary" required />
          <select value={role} onChange={e => setRole(e.target.value)} className="w-full p-3 bg-surface-container rounded-lg outline-primary">
            <option value="user">Standard User</option><option value="admin">Project Admin</option><option value="central">Central Admin</option>
          </select>
          <button type="submit" className="w-full bg-primary text-on-primary p-3 rounded-lg font-bold shadow-md hover:opacity-90">Join</button>
        </form>
      </div>
    </div>
  );
};

const AdminView = () => {
  const [data, setData] = useState({ users: [], channels: [] });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    socket.emit('admin get data');
    socket.on('admin data payload', (payload) => setData(payload));
    socket.on('admin action success', (m) => { setMsg(m); socket.emit('admin get data'); setTimeout(() => setMsg(''), 3000); });
    return () => { socket.off('admin data payload'); socket.off('admin action success'); }
  }, []);

  return (
    <div className="flex-1 bg-background p-8 overflow-y-auto text-on-surface">
      <h2 className="text-2xl font-bold mb-6">Central Admin Dashboard</h2>
      {msg && <div className="bg-secondary-container text-on-secondary-container p-3 rounded mb-4 font-bold">{msg}</div>}
      
      <div className="grid md:grid-cols-2 gap-8">
        <div className="glass-panel p-6 rounded-xl">
          <h3 className="font-bold text-lg mb-4 text-primary">User Management</h3>
          <div className="space-y-2">
            {data.users.map(u => (
              <div key={u.username} className="flex justify-between items-center p-3 bg-surface-container-low rounded border border-outline-variant/20">
                <div><span className="font-bold">{u.username}</span> <span className="text-xs text-on-surface-variant ml-2 uppercase">{u.role}</span></div>
                <button onClick={() => socket.emit('admin toggle user', { targetUser: u.username, disable: !u.is_disabled })} className={`text-xs px-3 py-1 rounded font-bold ${u.is_disabled ? 'bg-secondary text-white' : 'bg-error text-white'}`}>
                  {u.is_disabled ? 'Enable' : 'Disable'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-6 rounded-xl">
          <h3 className="font-bold text-lg mb-4 text-primary">Channel Audit</h3>
          <div className="space-y-2">
            {data.channels.map(c => (
              <div key={c.name} className="flex justify-between items-center p-3 bg-surface-container-low rounded border border-outline-variant/20">
                <span className="font-bold"># {c.name}</span>
                <button onClick={() => { if(window.confirm('Force delete this channel?')) socket.emit('admin delete channel', c.name) }} className="text-xs px-3 py-1 rounded font-bold bg-error/20 text-error hover:bg-error hover:text-white">Delete</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ProfileView = ({ currentUser, globalPrefs, setGlobalPrefs, setView }) => {
  const [profile, setProfile] = useState({ email: '', contact: '', status_msg: '', dark_mode: true, sound_alerts: true, mention_alerts: true });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    socket.emit('get profile', currentUser.username);
    socket.on('profile data', data => setProfile(data));
    socket.on('profile updated successfully', () => setMsg('Preferences Saved!'));
    return () => { socket.off('profile data'); socket.off('profile updated successfully'); };
  }, [currentUser]);

  const handleUpdate = (e) => {
    e.preventDefault();
    socket.emit('update profile', { ...profile, username: currentUser.username });
    setGlobalPrefs({ dark_mode: profile.dark_mode, sound_alerts: profile.sound_alerts, mention_alerts: profile.mention_alerts });
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="flex-1 bg-background p-8 flex justify-center items-center text-on-surface relative">
      <div className="max-w-md w-full glass-panel rounded-xl p-6 shadow-lg relative">
        <button onClick={() => setView('chat')} className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface bg-surface-container p-1 rounded-md transition-colors" title="Close">
            <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        <h2 className="text-2xl font-bold mb-6 text-center text-primary">My Settings</h2>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div><label className="text-xs font-bold text-on-surface-variant block mb-1">Status</label><input type="text" value={profile.status_msg} onChange={e => setProfile({...profile, status_msg: e.target.value})} className="w-full p-2 bg-surface-container rounded" /></div>
          
          <div className="border-t border-outline-variant/30 pt-4 mt-4">
            <h3 className="font-bold mb-3 text-sm uppercase tracking-wider">App Preferences</h3>
            <label className="flex items-center gap-3 cursor-pointer mb-2">
              <input type="checkbox" checked={profile.dark_mode} onChange={e => setProfile({...profile, dark_mode: e.target.checked})} className="accent-primary" />
              <span className="text-sm">Dark Mode</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer mb-2">
              <input type="checkbox" checked={profile.sound_alerts} onChange={e => setProfile({...profile, sound_alerts: e.target.checked})} className="accent-primary" />
              <span className="text-sm">Global Sound Alerts</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={profile.mention_alerts} onChange={e => setProfile({...profile, mention_alerts: e.target.checked})} className="accent-primary" />
              <span className="text-sm">Mention Sound Alerts (@user)</span>
            </label>
          </div>

          {msg && <div className="text-secondary text-sm text-center font-bold">{msg}</div>}
          <button type="submit" className="w-full bg-primary text-on-primary p-3 rounded font-bold hover:opacity-90 mt-4 shadow-sm">Save Changes</button>
        </form>
      </div>
    </div>
  );
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [currentView, setCurrentView] = useState('chat');
  const [currentRoom, setCurrentRoom] = useState('General');
  
  const [channels, setChannels] = useState(['General']);
  const [dms, setDms] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [globalPrefs, setGlobalPrefs] = useState({ dark_mode: true, sound_alerts: true, mention_alerts: true });

  useEffect(() => {
    if (globalPrefs.dark_mode) {
      document.documentElement.classList.add('dark'); document.documentElement.style.setProperty('--color-background', '#0f141b');
    } else {
      document.documentElement.classList.remove('dark'); document.documentElement.style.setProperty('--color-background', '#fdfcff'); 
    }
  }, [globalPrefs.dark_mode]);

  useEffect(() => {
    socket.on('login success', (data) => {
      setIsLoggedIn(true); setLoginError('');
      if (data.customChannels) setChannels(['General', ...data.customChannels]);
      if (data.dmRooms) setDms(data.dmRooms);
      if (data.preferences) setGlobalPrefs(data.preferences);
    });

    socket.on('login error', (msg) => setLoginError(msg));
    socket.on('all users list', (users) => setAllUsers(users));
    socket.on('new custom channel', (channelName) => setChannels(prev => prev.includes(channelName) ? prev : [...prev, channelName]));
    socket.on('channel deleted', (channelName) => {
       setChannels(prev => prev.filter(c => c !== channelName));
       if (currentRoom === channelName) setCurrentRoom('General');
    });
    
    socket.on('unread alert', (data) => {
      if (data.room !== currentRoom || currentView !== 'chat') {
        setUnreadCounts(prev => ({ ...prev, [data.room]: (prev[data.room] || 0) + 1 }));
        
        const isMention = data.text && data.text.includes(`@${user?.username}`);
        if (isMention && globalPrefs.mention_alerts) playAudioAlert('mention');
        else if (!isMention && globalPrefs.sound_alerts) playAudioAlert('standard');
      }
    });

    return () => { socket.off('login success'); socket.off('login error'); socket.off('all users list'); socket.off('unread alert'); socket.off('channel deleted'); };
  }, [currentRoom, currentView, user, globalPrefs]);

  const handleLogin = (username, role) => { setUser({ username, role }); socket.connect(); socket.emit('login', { username, role }); };
  const clearUnread = (room) => setUnreadCounts(prev => ({ ...prev, [room]: 0 }));

  if (!isLoggedIn) return <LoginScreen onLogin={handleLogin} errorMsg={loginError} />;

  return (
    <div className="flex h-screen font-sans overflow-hidden bg-background text-on-surface transition-colors duration-300">
      <Sidebar 
        setView={setCurrentView} activeView={currentView} currentRoom={currentRoom} setCurrentRoom={setCurrentRoom}
        channels={channels} dms={dms} currentUser={user} allUsers={allUsers} unreadCounts={unreadCounts} clearUnread={clearUnread}
      />
      
      {currentView === 'chat' ? <ChatView currentRoom={currentRoom} currentUser={user} roomDirectory={allUsers} /> 
      : currentView === 'calendar' ? <CalendarView currentUser={user} /> 
      : currentView === 'admin' ? <AdminView />
      : <ProfileView currentUser={user} globalPrefs={globalPrefs} setGlobalPrefs={setGlobalPrefs} setView={setCurrentView} />}
    </div>
  );
}

export default App;