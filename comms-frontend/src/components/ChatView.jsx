import { useState, useEffect, useRef } from 'react';
import socket from '../socket';

export default function ChatView({ currentRoom, currentUser, allUsers }) {
  // ... (Keep all your exact same state variables: messages, inputText, hoveredMsgId, etc.)
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const [roomDirectory, setRoomDirectory] = useState([]);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'central';

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView();

  useEffect(() => {
    socket.emit('join room', { room: currentRoom, username: currentUser.username });

    socket.on('chat history', (history) => { setMessages(history); scrollToBottom(); });
    socket.on('chat message', (msg) => { setMessages(prev => [...prev, msg]); scrollToBottom(); });
    socket.on('user typing', (user) => setTypingUsers(prev => [...new Set([...prev, user])]));
    socket.on('user stopped typing', (user) => setTypingUsers(prev => prev.filter(u => u !== user)));
    socket.on('room directory', (users) => setRoomDirectory(users));
    
    // Rich Features
    socket.on('message deleted', (msgId) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: 1 } : m)));
    socket.on('message deleted for me', (msgId) => setMessages(prev => prev.filter(m => m.id !== msgId)));
    socket.on('update pin', ({ msgId, isPinned }) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_pinned: isPinned } : m)));
    socket.on('update reaction', ({ msgId, emoji, users }) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: { ...m.reactions, [emoji]: users } } : m)));

    return () => {
      socket.off('chat history'); socket.off('chat message'); socket.off('user typing'); socket.off('user stopped typing');
      socket.off('room directory'); socket.off('message deleted'); socket.off('message deleted for me');
      socket.off('update pin'); socket.off('update reaction');
    };
  }, [currentRoom, currentUser.username]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;
    
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

  const handleTyping = (e) => {
    setInputText(e.target.value);
    socket.emit('typing', { room: currentRoom, username: currentUser.username });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socket.emit('stop typing', { room: currentRoom, username: currentUser.username }), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full relative bg-background">
      
      {/* Chat Header (Sticky & Glass) */}
      <header className="h-16 px-6 flex items-center justify-between border-b border-outline-variant/30 glass-panel sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-surface-container-lowest flex items-center justify-center text-on-surface border border-outline-variant shadow-sm">
            <span className="material-symbols-outlined font-bold">tag</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-on-surface">{currentRoom}</h2>
            <p className="text-xs text-on-surface-variant flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>
              {typingUsers.length > 0 ? <span className="text-primary italic">{typingUsers.join(', ')} is typing...</span> : `${roomDirectory.length} participants`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex -space-x-2">
            <div className="w-8 h-8 rounded-full border-2 border-background bg-surface-container flex items-center justify-center text-xs text-on-surface-variant">+{roomDirectory.length}</div>
          </div>
          <div className="h-6 w-[1px] bg-outline-variant/50 mx-2"></div>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">search</span>
          </button>
        </div>
      </header>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32 flex flex-col pt-4" ref={scrollContainerRef}>
        {messages.map((msg, idx) => {
          const isMe = msg.user === currentUser.username;
          if (msg.is_deleted) return <div key={msg.id} className="text-center text-xs text-on-surface-variant italic py-2">This message was deleted.</div>;

          return (
            <div key={msg.id || idx} className={`flex gap-4 items-end max-w-3xl relative group ${isMe ? 'ml-auto' : ''}`} onMouseEnter={() => setHoveredMsgId(msg.id)} onMouseLeave={() => setHoveredMsgId(null)}>
              
              {/* Message Content Container */}
              <div className={`flex flex-col gap-1 w-full ${isMe ? 'items-end' : 'items-start'}`}>
                
                <div className={`flex items-baseline gap-2 ${isMe ? 'mr-1' : 'ml-1'}`}>
                  {!isMe && <span className="font-bold text-sm text-on-surface">{msg.user}</span>}
                  {msg.is_pinned === 1 && <span className="text-yellow-500 text-xs">📌 Pinned</span>}
                  {isMe && <span className="font-bold text-sm text-on-surface">You</span>}
                </div>

                {/* The Bubble */}
                <div className={`p-4 rounded-2xl border relative group shadow-sm ${
                  isMe 
                    ? 'bg-gradient-to-br from-primary-container to-inverse-primary text-on-primary-container rounded-br-sm border-primary/20 shadow-[0_4px_24px_rgba(73,143,255,0.2)]' 
                    : 'bg-surface-container text-on-surface rounded-bl-sm border-outline-variant/50'
                } ${msg.is_pinned === 1 ? 'ring-2 ring-yellow-400' : ''}`}>
                  
                  {msg.file && msg.file.data && (
                    <div className="mb-2">
                      {msg.file.type.startsWith('image/') ? <img src={msg.file.data} alt="attachment" className="max-w-full rounded-lg max-h-64 object-cover" /> : <a href={msg.file.data} download={msg.file.name} className="underline text-sm flex items-center gap-1">📄 {msg.file.name}</a>}
                    </div>
                  )}
                  
                  <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                  
                  {msg.reactions && Object.keys(msg.reactions).some(k => msg.reactions[k]?.length > 0) && (
                    <div className={`flex gap-1 mt-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {Object.entries(msg.reactions).map(([emoji, users]) => users.length > 0 && (
                        <button key={emoji} onClick={() => socket.emit('add reaction', { msgId: msg.id, emoji, username: currentUser.username, roomId: currentRoom })} className={`text-xs px-2 py-1 rounded-full border shadow-sm ${users.includes(currentUser.username) ? 'bg-background text-on-surface border-primary' : 'bg-surface-container-highest text-on-surface border-outline-variant/30'}`}>
                          {emoji} {users.length}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Hover Glass Actions */}
                  {hoveredMsgId === msg.id && (
                    <div className={`absolute -top-4 glass-panel rounded-full px-2 py-1 flex items-center gap-1 shadow-lg z-20 ${isMe ? '-left-4' : '-right-4'}`}>
                      <button onClick={() => socket.emit('add reaction', { msgId: msg.id, emoji: '👍', username: currentUser.username, roomId: currentRoom })} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-surface-container-high transition-colors text-sm">👍</button>
                      {(isAdmin || isMe) && (
                        <>
                          <button onClick={() => socket.emit('toggle pin', { msgId: msg.id, room: currentRoom })} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-surface-container-high transition-colors text-sm">📌</button>
                          <button onClick={() => { if(isMe || isAdmin) { if(window.confirm("Delete for everyone?")) return socket.emit('delete message', {msgId: msg.id, room: currentRoom}); } socket.emit('delete for me', {msgId: msg.id, room: currentRoom}); }} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-900/30 text-red-400 transition-colors text-sm">🗑️</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Bottom Input Area */}
      <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-background via-background/95 to-transparent pt-10">
        <div className="max-w-4xl mx-auto">
          {selectedFile && <div className="glass-panel text-xs p-2 rounded-t-xl mx-4 flex justify-between border-b-0"><span>📎 {selectedFile.name}</span><button onClick={()=>setSelectedFile(null)} className="text-error font-bold">✕</button></div>}
          
          <form onSubmit={handleSendMessage} className="glass-panel rounded-2xl p-2 flex flex-col gap-2 shadow-xl focus-within:ring-1 ring-primary/30 transition-all duration-300">
            <input type="file" ref={fileInputRef} onChange={(e) => setSelectedFile(e.target.files[0])} className="hidden" />
            
            <textarea 
              className="w-full bg-transparent border-none text-on-surface text-sm placeholder-on-surface-variant focus:ring-0 resize-none px-4 py-2 outline-none" 
              placeholder={`Message #${currentRoom}...`} 
              rows="1"
              value={inputText}
              onChange={handleTyping}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
            ></textarea>
            
            <div className="flex items-center justify-between px-2 pb-1">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => fileInputRef.current.click()} className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors">
                  <span className="material-symbols-outlined text-[20px]">add_circle</span>
                </button>
                <button type="button" className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors">
                  <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-on-surface-variant hidden sm:inline-block mr-2"><strong>Enter</strong> to send</span>
                <button type="submit" className="bg-primary hover:bg-primary-container text-on-primary w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-md">
                  <span className="material-symbols-outlined text-[18px]">send</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}