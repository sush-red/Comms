import { useState } from 'react';

export default function Sidebar({
  setView, activeView, currentRoom, setCurrentRoom, 
  channels = [], dms = [], currentUser, allUsers = [],
  unreadCounts = {}, clearUnread
}) {
  // --- New Layout State ---
  const [activeTab, setActiveTab] = useState('channels'); 
  const [isPaneOpen, setIsPaneOpen] = useState(true);

  // When a user clicks a primary icon on the far left
  const handlePrimaryNavClick = (tabName, viewName = 'chat') => {
    setActiveTab(tabName);
    setIsPaneOpen(true); // Automatically slide the pane open
    setView(viewName);
  };

  const handleRoomClick = (room) => {
    setCurrentRoom(room);
    if (clearUnread) clearUnread(room);
    setView('chat'); 
  };

  return (
    <div className="flex h-full z-40 shrink-0 font-body-md text-on-surface">
      
      {/* 1. PRIMARY NAV PANE (Always Visible) */}
      <nav className="w-[72px] bg-surface-container-lowest border-r border-outline-variant/20 flex flex-col items-center py-6 shrink-0 relative z-50 shadow-lg">
        
        {/* Brand Hexagon */}
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary mb-8 shadow-[0_0_15px_rgba(172,199,255,0.15)] cursor-pointer">
          <span className="material-symbols-outlined font-bold text-[24px]">hexagon</span>
        </div>

        {/* Primary Icons */}
        <div className="flex flex-col gap-4 w-full px-2">
          
          <button 
            onClick={() => handlePrimaryNavClick('channels', 'chat')}
            className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-colors relative group ${activeTab === 'channels' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
          >
            <span className="material-symbols-outlined">hub</span>
          </button>

          <button 
            onClick={() => handlePrimaryNavClick('dms', 'chat')}
            className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-colors relative group ${activeTab === 'dms' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
          >
            <span className="material-symbols-outlined">forum</span>
            {/* Aggregate DM Unread Dot */}
            {dms.some(dm => unreadCounts[dm] > 0) && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"></span>
            )}
          </button>

          <button 
            onClick={() => handlePrimaryNavClick('calendar', 'calendar')}
            className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-colors relative group ${activeView === 'calendar' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
          >
            <span className="material-symbols-outlined">calendar_today</span>
          </button>

        </div>

        {/* User Profile Mini (Bottom) */}
        <div className="mt-auto relative group cursor-pointer" onClick={() => setView('profile')}>
          <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant hover:border-primary flex items-center justify-center font-bold text-lg transition-colors">
            {currentUser?.username?.charAt(0).toUpperCase()}
          </div>
          <div className="absolute bottom-[-2px] right-[-2px] w-3.5 h-3.5 bg-secondary rounded-full border-2 border-surface-container-lowest"></div>
        </div>
      </nav>


      {/* 2. SECONDARY PANE (Collapsible) */}
      {isPaneOpen && (
        <aside className="w-[280px] bg-surface-container/60 backdrop-blur-xl border-r border-outline-variant/20 flex flex-col shrink-0 shadow-2xl transition-all duration-300">
          
          {/* Pane Header */}
          <div className="px-5 pt-6 pb-4 flex items-center justify-between border-b border-outline-variant/10">
            <h2 className="font-headline-md text-lg font-bold text-on-surface capitalize">
              {activeTab === 'channels' ? 'Channels' : 'Direct Messages'}
            </h2>
            <button 
              onClick={() => setIsPaneOpen(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              title="Collapse Panel"
            >
              <span className="material-symbols-outlined text-[20px]">keyboard_double_arrow_left</span>
            </button>
          </div>

          {/* Search/Filter Bar */}
          <div className="px-4 py-3">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
              <input 
                className="w-full bg-surface-container-lowest/50 border border-outline-variant/30 rounded-lg py-1.5 pl-9 pr-3 text-sm text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary/50 transition-all" 
                placeholder={`Search ${activeTab}...`} 
                type="text"
              />
            </div>
          </div>

          {/* Dynamic List Content */}
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 custom-scrollbar">
            
            {/* CHANNELS VIEW */}
            {activeTab === 'channels' && channels.map(channel => (
              <div 
                key={channel} 
                onClick={() => handleRoomClick(channel)} 
                className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors relative ${currentRoom === channel && activeView === 'chat' ? 'bg-surface-container-high text-on-surface border border-outline-variant/30 shadow-sm' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-surface-container-lowest flex items-center justify-center border border-outline-variant/50 font-bold text-xs opacity-70">#</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{channel}</p>
                </div>
                {unreadCounts[channel] > 0 && (
                  <span className="bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">{unreadCounts[channel]}</span>
                )}
              </div>
            ))}

            {/* DIRECT MESSAGES VIEW */}
            {activeTab === 'dms' && dms.map(dm => {
              const displayName = dm.startsWith('DM-') ? dm.replace('DM-', '').split('-').filter(u => u !== currentUser?.username).join(', ') : dm;
              return (
                <div 
                  key={dm} 
                  onClick={() => handleRoomClick(dm)} 
                  className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors relative ${currentRoom === dm && activeView === 'chat' ? 'bg-surface-container-high text-on-surface border border-outline-variant/30 shadow-sm' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}
                >
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-surface-container-lowest flex items-center justify-center border border-outline-variant/50 font-bold text-xs">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-secondary rounded-full border-2 border-surface-container-high"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{displayName}</p>
                  </div>
                  {unreadCounts[dm] > 0 && (
                    <span className="bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">{unreadCounts[dm]}</span>
                  )}
                </div>
              );
            })}
          </div>

        </aside>
      )}
    </div>
  );
}