import { useState, useEffect } from 'react';
import socket from '../socket';

export default function Sidebar({
  setView, activeView, currentRoom, setCurrentRoom, 
  channels = [], dms = [], currentUser, allUsers = [],
  unreadCounts, clearUnread
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'central';

  const handleRoomClick = (room) => {
    setCurrentRoom(room);
    clearUnread(room);
    setView('chat'); 
  };

  const handleCreateChannel = (e) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    const finalMembers = [...new Set([...selectedMembers, currentUser.username])];
    socket.emit('create custom channel', { name: newChannelName.trim(), members: finalMembers });
    setShowCreateModal(false);
    setNewChannelName('');
    setSelectedMembers([]);
  };

  const toggleMember = (user) => {
    setSelectedMembers(prev => prev.includes(user) ? prev.filter(u => u !== user) : [...prev, user]);
  };

  return (
    <div className="w-[280px] bg-sidebar-bg text-white flex flex-col p-4 z-20 shadow-lg relative">
      <div className="flex items-center justify-between mb-6 px-2">
        <h1 className="text-xl font-bold">Comms Pro</h1>
      </div>
      
      <div className="flex bg-white/10 p-1 rounded-lg mb-6 gap-1">
        <button onClick={() => setView('chat')} className={`flex-1 py-2 rounded font-bold text-sm shadow-sm transition-all ${activeView === 'chat' ? 'bg-primary text-white' : 'text-white/70 hover:text-white'}`}>💬 Chat</button>
        <button onClick={() => setView('calendar')} className={`flex-1 py-2 rounded font-bold text-sm shadow-sm transition-all ${activeView === 'calendar' ? 'bg-primary text-white' : 'text-white/70 hover:text-white'}`}>📅 Cal</button>
      </div>
      
      <div className="flex-1 overflow-y-auto chat-scroll pr-2">
        {/* CHANNELS SECTION */}
        <div className="px-3 mb-2 text-white/50 text-xs font-bold uppercase tracking-wider flex justify-between items-center mt-2">
          <span>Channels</span>
          {isAdmin && (
            <button onClick={() => setShowCreateModal(true)} className="hover:text-white font-bold text-lg leading-none">+</button>
          )}
        </div>
        <div className="space-y-1 mb-6">
          {channels.map(channel => (
            <div key={channel} onClick={() => handleRoomClick(channel)} className={`px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex justify-between items-center ${currentRoom === channel && activeView === 'chat' ? 'bg-primary/20 border-l-4 border-primary text-white' : 'text-white/70 hover:bg-white/5 border-l-4 border-transparent'}`}>
              <span># {channel}</span>
              {unreadCounts[channel] > 0 && <span className="bg-unread-coral text-white text-[10px] px-2 py-0.5 rounded-full">{unreadCounts[channel]}</span>}
            </div>
          ))}
        </div>

        {/* DIRECT MESSAGES SECTION */}
        {dms.length > 0 && (
          <>
            <div className="px-3 mb-2 text-white/50 text-xs font-bold uppercase tracking-wider">Direct Messages</div>
            <div className="space-y-1">
              {dms.map(dm => {
                const displayName = dm.startsWith('DM-') ? dm.replace('DM-', '').split('-').filter(u => u !== currentUser?.username).join(', ') : dm;
                return (
                  <div key={dm} onClick={() => handleRoomClick(dm)} className={`px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex justify-between items-center ${currentRoom === dm && activeView === 'chat' ? 'bg-primary/20 border-l-4 border-primary text-white' : 'text-white/70 hover:bg-white/5 border-l-4 border-transparent'}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      {displayName}
                    </div>
                    {unreadCounts[dm] > 0 && <span className="bg-unread-coral text-white text-[10px] px-2 py-0.5 rounded-full">{unreadCounts[dm]}</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      
      {/* Mini Profile Footer */}
      <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between px-2 cursor-pointer hover:bg-white/5 p-2 rounded-lg" onClick={() => setView('profile')}>
         <div className="flex items-center gap-3 overflow-hidden">
             <div className="w-8 h-8 rounded-full bg-primary/40 flex items-center justify-center font-bold text-sm relative">
                {currentUser?.username?.charAt(0).toUpperCase()}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-sidebar-bg rounded-full"></span>
             </div>
             <div className="flex-1 overflow-hidden">
                <div className="text-sm font-bold truncate">{currentUser?.username}</div>
                <div className="text-[10px] text-white/60 capitalize">{currentUser?.role}</div>
             </div>
         </div>
         <span className="text-white/50 text-xs">⚙️</span>
      </div>

      {/* Create Channel Modal */}
      {showCreateModal && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-sm flex flex-col text-on-surface">
            <div className="px-4 py-3 border-b border-border-subtle flex justify-between items-center">
              <h3 className="font-bold">New Channel</h3>
              <button onClick={() => setShowCreateModal(false)} className="font-bold">✕</button>
            </div>
            <form onSubmit={handleCreateChannel} className="p-4 space-y-4">
              <input type="text" placeholder="Channel Name (e.g. Project-Alpha)" value={newChannelName} onChange={e => setNewChannelName(e.target.value.replace(/\s+/g, '-'))} className="w-full p-2 border rounded outline-none text-sm" required />
              <div className="max-h-40 overflow-y-auto border rounded p-2 bg-white">
                <p className="text-xs font-bold mb-2 text-on-surface-variant">Select Members:</p>
                {allUsers.filter(u => u !== currentUser.username).map(user => (
                  <label key={user} className="flex items-center gap-2 text-sm p-1 hover:bg-surface-container rounded cursor-pointer">
                    <input type="checkbox" checked={selectedMembers.includes(user)} onChange={() => toggleMember(user)} />
                    {user}
                  </label>
                ))}
              </div>
              <button type="submit" className="w-full bg-primary text-white py-2 rounded font-bold text-sm">Create</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}