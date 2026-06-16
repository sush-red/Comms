import { useState, useEffect, useRef } from 'react';
import socket from '../socket';

export default function ChatView({ currentRoom, currentUser, allUsers }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  
  // Modals & Drawers
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [roomDirectory, setRoomDirectory] = useState([]);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'central';
  const isDM = currentRoom.startsWith('DM-');

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView();

  useEffect(() => {
    socket.emit('join room', { room: currentRoom, username: currentUser.username });

    socket.on('chat history', (history) => { setMessages(history); scrollToBottom(); });
    socket.on('older messages', (older) => {
      setMessages(prev => [...older, ...prev]);
      // Maintain scroll position slightly down so it doesn't jump to the very top
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 50; 
    });
    socket.on('chat message', (msg) => { setMessages(prev => [...prev, msg]); scrollToBottom(); });
    
    socket.on('user typing', (user) => setTypingUsers(prev => [...new Set([...prev, user])]));
    socket.on('user stopped typing', (user) => setTypingUsers(prev => prev.filter(u => u !== user)));
    
    socket.on('room directory', (users) => setRoomDirectory(users));
    socket.on('room directory update', () => socket.emit('join room', { room: currentRoom, username: currentUser.username }));
    
    socket.on('search results', (results) => setSearchResults(results));

    // Rich features
    socket.on('message deleted', (msgId) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: 1 } : m)));
    socket.on('message deleted for me', (msgId) => setMessages(prev => prev.filter(m => m.id !== msgId)));
    socket.on('update pin', ({ msgId, isPinned }) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_pinned: isPinned } : m)));
    socket.on('update reaction', ({ msgId, emoji, users }) => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: { ...m.reactions, [emoji]: users } } : m));
    });

    return () => {
      socket.off('chat history'); socket.off('older messages'); socket.off('chat message');
      socket.off('user typing'); socket.off('user stopped typing');
      socket.off('room directory'); socket.off('room directory update'); socket.off('search results');
      socket.off('message deleted'); socket.off('message deleted for me'); socket.off('update pin'); socket.off('update reaction');
    };
  }, [currentRoom, currentUser.username]);

  const handleScroll = (e) => {
    if (e.target.scrollTop === 0 && messages.length >= 50) {
      socket.emit('load more messages', { room: currentRoom, offset: messages.length });
    }
  };

  const handleTyping = (e) => {
    setInputText(e.target.value);
    socket.emit('typing', { room: currentRoom, username: currentUser.username });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop typing', { room: currentRoom, username: currentUser.username });
    }, 2000);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;
    socket.emit('stop typing', { room: currentRoom, username: currentUser.username });

    const payload = { user: currentUser.username, text: inputText, room: currentRoom };
    
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        payload.file = { name: selectedFile.name, type: selectedFile.type, data: evt.target.result };
        socket.emit('chat message', payload);
        setSelectedFile(null); setInputText("");
      };
      reader.readAsDataURL(selectedFile);
    } else {
      socket.emit('chat message', payload);
      setInputText("");
    }
  };

  const executeSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) socket.emit('search messages', searchQuery);
  };

  const handleAddMember = (userToAdd) => {
    socket.emit('add channel members', { room: currentRoom, newUsers: [userToAdd] });
  };
  const handleRemoveMember = (userToRemove) => {
    socket.emit('remove channel member', { room: currentRoom, userToRemove });
  };
  const handlePromote = (userToPromote) => {
    socket.emit('promote to admin', userToPromote);
  };

  return (
    <div className="flex-1 flex flex-col bg-background h-screen relative">
      <header className="bg-surface shadow-sm px-6 py-4 flex items-center justify-between border-b border-border-subtle z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary font-bold">#</div>
          <div>
            <h2 className="text-xl font-bold text-on-surface">{currentRoom}</h2>
            <p className="text-xs text-on-surface-variant">
              {typingUsers.length > 0 ? <span className="text-primary italic">{typingUsers.join(', ')} is typing...</span> : `${roomDirectory.length} participants`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSearch(!showSearch)} className="p-2 bg-surface-container rounded-lg hover:bg-primary hover:text-white transition">🔍 Search</button>
          {!isDM && <button onClick={() => setShowMembers(!showMembers)} className="p-2 bg-surface-container rounded-lg hover:bg-primary hover:text-white transition">👥 Members</button>}
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 chat-scroll pb-32" onScroll={handleScroll} ref={scrollContainerRef}>
        {messages.map((msg, idx) => {
          const isMe = msg.user === currentUser.username;
          if (msg.is_deleted) return <div key={msg.id} className="text-center text-xs text-on-surface-variant italic py-2">This message was deleted.</div>;

          return (
            <div key={msg.id || idx} className={`flex flex-col relative group ${isMe ? 'items-end' : 'items-start'}`} onMouseEnter={() => setHoveredMsgId(msg.id)} onMouseLeave={() => setHoveredMsgId(null)}>
              <span className="text-xs font-bold text-on-surface-variant mb-1 mx-1">
                {isMe ? 'You' : msg.user} {msg.is_pinned === 1 && <span className="text-yellow-500">📌</span>}
              </span>
              <div className={`p-3 max-w-[75%] shadow-sm relative ${msg.is_pinned === 1 ? 'ring-2 ring-yellow-400' : ''} ${isMe ? 'bg-primary text-on-primary rounded-[16px_16px_4px_16px]' : 'bg-white text-on-surface rounded-[16px_16px_16px_4px] border border-border-subtle'}`}>
                {msg.file && msg.file.data && (
                  <div className="mb-2">
                    {msg.file.type.startsWith('image/') ? <img src={msg.file.data} alt="attachment" className="max-w-full rounded-lg max-h-64 object-cover" /> : <a href={msg.file.data} download={msg.file.name} className="underline text-sm flex items-center gap-1">📄 {msg.file.name}</a>}
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                {msg.reactions && Object.keys(msg.reactions).some(k => msg.reactions[k]?.length > 0) && (
                  <div className={`flex gap-1 mt-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {Object.entries(msg.reactions).map(([emoji, users]) => users.length > 0 && (
                      <button key={emoji} onClick={() => socket.emit('add reaction', { msgId: msg.id, emoji, username: currentUser.username, roomId: currentRoom })} className={`text-xs px-2 py-1 rounded-full border shadow-sm ${users.includes(currentUser.username) ? 'bg-primary/20 border-primary' : 'bg-white text-black border-border-subtle'}`}>
                        {emoji} {users.length}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {hoveredMsgId === msg.id && (
                <div className={`absolute top-0 -mt-6 bg-white border border-border-subtle shadow-md rounded-lg flex gap-1 p-1 z-20 ${isMe ? 'right-0' : 'left-0'}`}>
                  <button onClick={() => socket.emit('add reaction', { msgId: msg.id, emoji: '👍', username: currentUser.username, roomId: currentRoom })} className="hover:bg-surface-container p-1 rounded">👍</button>
                  {(isAdmin || isMe) && (
                    <>
                      <div className="w-px bg-border-subtle mx-1"></div>
                      <button onClick={() => socket.emit('toggle pin', { msgId: msg.id, room: currentRoom })} className="hover:bg-surface-container p-1 rounded text-xs px-2">📌</button>
                      <button onClick={() => { if(isMe || isAdmin) { if(window.confirm("Delete for everyone?")) return socket.emit('delete message', {msgId: msg.id, room: currentRoom}); } socket.emit('delete for me', {msgId: msg.id, room: currentRoom}); }} className="hover:bg-red-50 text-red-500 p-1 rounded text-xs px-2">🗑️</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent pt-10">
        {selectedFile && <div className="bg-surface-container text-xs p-2 rounded-t-xl mx-4 flex justify-between border border-b-0"><span>📎 {selectedFile.name}</span><button onClick={()=>setSelectedFile(null)} className="text-red-500 font-bold">✕</button></div>}
        <form onSubmit={handleSendMessage} className="bg-white border rounded-xl shadow-md p-2 flex items-center gap-2">
          <input type="file" ref={fileInputRef} onChange={(e) => setSelectedFile(e.target.files[0])} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current.click()} className="p-2 text-on-surface-variant hover:text-primary rounded-lg font-bold">📎</button>
          <input type="text" value={inputText} onChange={handleTyping} placeholder={`Message #${currentRoom}...`} className="flex-1 bg-transparent border-none outline-none px-3 py-2 text-on-surface" />
          <button type="submit" className="bg-primary text-white p-2 px-6 rounded-lg font-bold hover:bg-primary/90">Send</button>
        </form>
      </div>

      {/* Modals & Drawers */}
      {showSearch && (
        <div className="absolute right-0 top-20 w-80 bg-white border border-border-subtle shadow-2xl rounded-l-xl z-30 h-3/4 flex flex-col overflow-hidden">
          <div className="p-4 border-b bg-surface flex justify-between"><h3 className="font-bold">Search Room</h3><button onClick={()=>setShowSearch(false)}>✕</button></div>
          <form onSubmit={executeSearch} className="p-4 border-b"><input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search messages..." className="w-full p-2 border rounded text-sm outline-primary" /></form>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {searchResults.map(res => (
              <div key={res.id} className="text-sm bg-surface-container-lowest border rounded p-2">
                <span className="font-bold text-xs text-primary block">{res.user}</span>
                <p className="mt-1">{res.text}</p>
                <span className="text-[10px] text-on-surface-variant mt-2 block">{new Date(res.timestamp).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showMembers && !isDM && (
        <div className="absolute right-0 top-20 w-80 bg-white border border-border-subtle shadow-2xl rounded-l-xl z-30 h-3/4 flex flex-col overflow-hidden">
           <div className="p-4 border-b bg-surface flex justify-between"><h3 className="font-bold">Room Directory</h3><button onClick={()=>setShowMembers(false)}>✕</button></div>
           <div className="flex-1 overflow-y-auto p-4 space-y-2">
             {roomDirectory.map(u => (
               <div key={u} className="flex justify-between items-center text-sm p-2 bg-surface-container-low rounded">
                 <span className="font-bold">{u}</span>
                 {isAdmin && u !== currentUser.username && (
                   <div className="flex gap-1">
                     <button onClick={()=>handlePromote(u)} title="Make Admin" className="text-yellow-500 hover:bg-yellow-100 p-1 rounded">👑</button>
                     {currentRoom !== 'General' && <button onClick={()=>handleRemoveMember(u)} title="Remove" className="text-red-500 hover:bg-red-100 p-1 rounded">✕</button>}
                   </div>
                 )}
               </div>
             ))}
           </div>
           {isAdmin && currentRoom !== 'General' && (
             <div className="p-4 border-t bg-surface">
               <p className="text-xs font-bold mb-2">Add Member</p>
               <select onChange={(e) => {if(e.target.value) handleAddMember(e.target.value); e.target.value='';}} className="w-full p-2 border rounded text-sm">
                 <option value="">Select user...</option>
                 {allUsers.filter(u => !roomDirectory.includes(u)).map(u => <option key={u} value={u}>{u}</option>)}
               </select>
             </div>
           )}
        </div>
      )}
    </div>
  );
}