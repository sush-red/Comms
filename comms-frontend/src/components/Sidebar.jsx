import React from 'react';

export default function Sidebar({
  setView,
  activeView,
  currentRoom,
  setCurrentRoom,
  channels = [],
  dms = [],
  currentUser
}) {
  const handleRoomClick = (room) => {
    setCurrentRoom(room);
    setView('chat'); // Automatically switch to chat view if they click a room
  };

  return (
    <div className="w-[280px] bg-sidebar-bg text-white flex flex-col p-4 z-20 shadow-lg">
      <div className="flex items-center justify-between mb-6 px-2">
        <h1 className="text-xl font-bold">Comms Pro</h1>
      </div>
      
      <div className="flex bg-white/10 p-1 rounded-lg mb-6 gap-1">
        <button 
          onClick={() => setView('chat')} 
          className={`flex-1 py-2 rounded font-bold text-sm shadow-sm transition-all ${activeView === 'chat' ? 'bg-primary text-white' : 'text-white/70 hover:text-white'}`}
        >
          💬 Chat
        </button>
        <button 
          onClick={() => setView('calendar')} 
          className={`flex-1 py-2 rounded font-bold text-sm shadow-sm transition-all ${activeView === 'calendar' ? 'bg-primary text-white' : 'text-white/70 hover:text-white'}`}
        >
          📅 Cal
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto chat-scroll pr-2">
        {/* CHANNELS SECTION */}
        <div className="px-3 mb-2 text-white/50 text-xs font-bold uppercase tracking-wider mt-2">
          Channels
        </div>
        <div className="space-y-1 mb-6">
          {channels.map(channel => (
            <div 
              key={channel}
              onClick={() => handleRoomClick(channel)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                currentRoom === channel && activeView === 'chat'
                  ? 'bg-primary/20 border-l-4 border-primary text-white' 
                  : 'text-white/70 hover:bg-white/5 border-l-4 border-transparent'
              }`}
            >
              # {channel}
            </div>
          ))}
        </div>

        {/* DIRECT MESSAGES SECTION */}
        {dms.length > 0 && (
          <>
            <div className="px-3 mb-2 text-white/50 text-xs font-bold uppercase tracking-wider">
              Direct Messages
            </div>
            <div className="space-y-1">
              {dms.map(dm => {
                // Strip "DM-" and your own name to just show the other person's name
                const displayName = dm.startsWith('DM-') 
                  ? dm.replace('DM-', '').split('-').filter(u => u !== currentUser?.username).join(', ') 
                  : dm;
                  
                return (
                  <div 
                    key={dm}
                    onClick={() => handleRoomClick(dm)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center gap-2 ${
                      currentRoom === dm && activeView === 'chat'
                        ? 'bg-primary/20 border-l-4 border-primary text-white' 
                        : 'text-white/70 hover:bg-white/5 border-l-4 border-transparent'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    {displayName}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      
      {/* Mini Profile Footer */}
      <div className="mt-auto pt-4 border-t border-white/10 flex items-center gap-3 px-2">
         <div className="w-8 h-8 rounded-full bg-primary/40 flex items-center justify-center font-bold text-sm">
            {currentUser?.username?.charAt(0).toUpperCase()}
         </div>
         <div className="flex-1 overflow-hidden">
            <div className="text-sm font-bold truncate">{currentUser?.username}</div>
            <div className="text-[10px] text-white/60 capitalize">{currentUser?.role}</div>
         </div>
      </div>
    </div>
  );
}