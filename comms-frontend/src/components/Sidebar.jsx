import { useState } from 'react';
import socket from '../socket';

export default function Sidebar({
  setView, activeView, currentRoom, setCurrentRoom, 
  channels = [], dms = [], currentUser, allUsers = [], unreadCounts = {}, clearUnread
}) {
  const [activeTab, setActiveTab] = useState('channels'); 
  const [isPaneOpen, setIsPaneOpen] = useState(true);
  
  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createInput, setCreateInput] = useState('');

  const handlePrimaryNavClick = (tabName, viewName = 'chat') => {
    setActiveTab(tabName); setIsPaneOpen(true); setView(viewName);
  };

  const handleRoomClick = (room) => {
    setCurrentRoom(room); if (clearUnread) clearUnread(room); setView('chat'); 
  };

  const executeCreate = () => {
    if (activeTab === 'channels') {
      const name = createInput.trim().replace(/\s+/g, '-');
      if (name) {
        socket.emit('create custom channel', { name, members: [currentUser.username] });
      }
    } else {
      if (createInput) {
        const dmName = `DM-${[currentUser.username, createInput].sort().join('-')}`;
        handleRoomClick(dmName);
      }
    }
    setShowCreateModal(false);
    setCreateInput('');
  };

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex h-full z-40 shrink-0 font-body-md text-on-surface">
      
      <nav className="w-[72px] bg-surface-container-lowest border-r border-outline-variant/20 flex flex-col items-center py-6 shrink-0 relative z-50 shadow-lg">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary mb-8 cursor-pointer shadow-[0_0_15px_rgba(172,199,255,0.15)]">
          <span className="material-symbols-outlined font-bold text-[24px]">hexagon</span>
        </div>

        <div className="flex flex-col gap-4 w-full px-2">
          <button onClick={() => handlePrimaryNavClick('channels', 'chat')} className={`group w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-colors relative ${activeTab === 'channels' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
            <span className="material-symbols-outlined">hub</span>
            <div className="absolute left-full ml-4 px-2 py-1 bg-surface-container-highest text-on-surface text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">Channels</div>
          </button>

          <button onClick={() => handlePrimaryNavClick('dms', 'chat')} className={`group w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-colors relative ${activeTab === 'dms' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
            <span className="material-symbols-outlined">chat</span>
            {dms.some(dm => unreadCounts[dm] > 0) && <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"></span>}
            <div className="absolute left-full ml-4 px-2 py-1 bg-surface-container-highest text-on-surface text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">Direct Messages</div>
          </button>

          <button onClick={() => handlePrimaryNavClick('calendar', 'calendar')} className={`group w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-colors relative ${activeView === 'calendar' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
            <span className="material-symbols-outlined">calendar_today</span>
            <div className="absolute left-full ml-4 px-2 py-1 bg-surface-container-highest text-on-surface text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">Calendar</div>
          </button>

          {currentUser?.role === 'central' && (
            <button onClick={() => setView('admin')} className={`group w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-colors relative ${activeView === 'admin' ? 'bg-error-container text-error' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
              <span className="material-symbols-outlined">admin_panel_settings</span>
              <div className="absolute left-full ml-4 px-2 py-1 bg-surface-container-highest text-on-surface text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">Admin Dashboard</div>
            </button>
          )}
        </div>

        <div className="mt-auto flex flex-col items-center gap-4 w-full px-2">
          <button className="group w-10 h-10 mx-auto rounded-xl flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high relative">
            <span className="material-symbols-outlined">notifications</span>
            {totalUnread > 0 && <span className="absolute top-2 right-2 w-3 h-3 bg-error text-white text-[8px] flex items-center justify-center rounded-full font-bold">{totalUnread}</span>}
            <div className="absolute left-full ml-4 px-2 py-1 bg-surface-container-highest text-on-surface text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">Notifications</div>
          </button>
          
          <div className="relative cursor-pointer group" onClick={() => setView('profile')}>
            <div className="w-10 h-10 mx-auto rounded-xl bg-surface-container-high border border-outline-variant hover:border-primary flex items-center justify-center font-bold text-lg transition-colors">{currentUser?.username?.charAt(0).toUpperCase()}</div>
            <div className="absolute bottom-[-2px] right-2 w-3.5 h-3.5 bg-secondary rounded-full border-2 border-surface-container-lowest"></div>
            <div className="absolute left-full ml-4 px-2 py-1 bg-surface-container-highest text-on-surface text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">My Profile</div>
          </div>
        </div>
      </nav>

      {isPaneOpen && (
        <aside className="w-[280px] bg-surface-container/60 backdrop-blur-xl border-r border-outline-variant/20 flex flex-col shrink-0 shadow-2xl transition-all">
          <div className="px-5 pt-6 pb-4 flex items-center justify-between border-b border-outline-variant/10">
            <h2 className="font-headline-md text-lg font-bold capitalize">{activeTab === 'channels' ? 'Channels' : 'Direct Messages'}</h2>
            <div className="flex items-center gap-1">
                <button onClick={() => setShowCreateModal(true)} className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary hover:bg-primary hover:text-on-primary transition-colors" title={`New ${activeTab === 'channels' ? 'Channel' : 'DM'}`}>
                  <span className="material-symbols-outlined text-[20px]">add</span>
                </button>
                <button onClick={() => setIsPaneOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-container-high text-on-surface-variant transition-colors" title="Collapse">
                  <span className="material-symbols-outlined text-[20px]">keyboard_double_arrow_left</span>
                </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 custom-scrollbar mt-4">
            
            {activeTab === 'channels' && channels.map(channel => (
              <div key={channel} onClick={() => handleRoomClick(channel)} className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${currentRoom === channel && activeView === 'chat' ? 'bg-surface-container-high border border-outline-variant/30 text-on-surface' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}>
                <div className="w-8 h-8 rounded-lg bg-surface-container-lowest flex items-center justify-center text-xs opacity-70 border border-outline-variant/30">#</div>
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{channel}</p></div>
                {unreadCounts[channel] > 0 && <span className="bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 rounded-full">{unreadCounts[channel]}</span>}
              </div>
            ))}
            
            {activeTab === 'dms' && dms.map(dm => {
              const displayName = dm.startsWith('DM-') ? dm.replace('DM-', '').split('-').filter(u => u !== currentUser?.username).join(', ') : dm;
              return (
                <div key={dm} onClick={() => handleRoomClick(dm)} className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${currentRoom === dm && activeView === 'chat' ? 'bg-surface-container-high border border-outline-variant/30 text-on-surface' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}>
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-surface-container-lowest flex items-center justify-center border border-outline-variant/50 font-bold text-xs">{displayName.charAt(0).toUpperCase()}</div>
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-secondary rounded-full border-2 border-surface-container-high"></div>
                  </div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{displayName}</p></div>
                  {unreadCounts[dm] > 0 && <span className="bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 rounded-full">{unreadCounts[dm]}</span>}
                </div>
              );
            })}

          </div>
        </aside>
      )}

      {/* Action Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/50 max-w-sm w-full p-6">
              <h3 className="text-lg font-bold mb-4 text-on-surface">{activeTab === 'channels' ? 'Create Channel' : 'New Direct Message'}</h3>
              
              {activeTab === 'channels' ? (
                <input type="text" placeholder="Channel Name (e.g. project-alpha)" value={createInput} onChange={e => setCreateInput(e.target.value)} className="w-full p-3 bg-surface-container-low border border-outline-variant/30 rounded-lg outline-primary text-on-surface" />
              ) : (
                <select value={createInput} onChange={e => setCreateInput(e.target.value)} className="w-full p-3 bg-surface-container-low border border-outline-variant/30 rounded-lg outline-primary text-on-surface appearance-none">
                   <option value="" disabled>Select a user to message...</option>
                   {allUsers.filter(u => u !== currentUser.username).map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              )}

              <div className="flex justify-end gap-3 mt-6">
                 <button onClick={() => { setShowCreateModal(false); setCreateInput(''); }} className="px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors">Cancel</button>
                 <button onClick={executeCreate} className="px-4 py-2 text-sm font-bold bg-primary text-on-primary rounded-lg shadow-sm hover:opacity-90">Start</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}