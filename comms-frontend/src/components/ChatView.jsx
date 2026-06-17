import { useState, useEffect, useRef } from 'react';
import socket from '../socket';

export default function ChatView({ currentRoom, currentUser, roomDirectory = [] }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  
  // Custom Modals & Engines
  const [showMentions, setShowMentions] = useState(false);
  const [mentionOptions, setMentionOptions] = useState([]);
  const [cursorPos, setCursorPos] = useState(0);
  const [deleteContext, setDeleteContext] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null); // Message Reply State

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
    
    socket.on('message deleted', (msgId) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: 1 } : m)));
    socket.on('message deleted for me', (msgId) => setMessages(prev => prev.filter(m => m.id !== msgId)));
    socket.on('update pin', ({ msgId, isPinned }) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_pinned: isPinned } : m)));
    socket.on('update reaction', ({ msgId, emoji, users }) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: { ...m.reactions, [emoji]: users } } : m)));

    return () => {
      socket.off('chat history'); socket.off('chat message'); socket.off('user typing'); socket.off('user stopped typing');
      socket.off('message deleted'); socket.off('message deleted for me'); socket.off('update pin'); socket.off('update reaction');
    };
  }, [currentRoom, currentUser.username]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;
    
    const payload = { user: currentUser.username, text: inputText, room: currentRoom };
    if (replyingTo) payload.replyTo = replyingTo;

    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        payload.file = { name: selectedFile.name, type: selectedFile.type, data: evt.target.result };
        socket.emit('chat message', payload);
        setSelectedFile(null); setInputText(""); setShowMentions(false); setReplyingTo(null);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      socket.emit('chat message', payload);
      setInputText(""); setShowMentions(false); setReplyingTo(null);
    }
  };

  const handleTyping = (e) => {
    const val = e.target.value;
    setInputText(val);
    const pos = e.target.selectionStart;
    setCursorPos(pos);

    const textBeforeCursor = val.substring(0, pos);
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    
    if (match) {
      const query = match[1].toLowerCase();
      const filtered = roomDirectory.filter(u => u.toLowerCase().startsWith(query) && u !== currentUser.username);
      setMentionOptions(filtered);
      setShowMentions(filtered.length > 0);
    } else {
      setShowMentions(false);
    }

    socket.emit('typing', { room: currentRoom, username: currentUser.username });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socket.emit('stop typing', { room: currentRoom, username: currentUser.username }), 2000);
  };

  const insertMention = (userToTag) => {
    const textBeforeCursor = inputText.substring(0, cursorPos);
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    if (match) {
      const startPos = match.index + (match[0].startsWith(' ') ? 1 : 0);
      const newText = inputText.substring(0, startPos) + `@${userToTag} ` + inputText.substring(cursorPos);
      setInputText(newText);
    }
    setShowMentions(false);
  };

  const renderMessageText = (text) => {
    if (!text) return null;
    const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) return <span key={i} className="text-tertiary-container font-bold bg-tertiary/10 px-1 rounded">{part}</span>;
      return part;
    });
  };

  const executeDelete = (type) => {
    if (type === 'everyone') socket.emit('delete message', { msgId: deleteContext.msgId, room: currentRoom });
    if (type === 'me') socket.emit('delete for me', { msgId: deleteContext.msgId, room: currentRoom });
    setDeleteContext(null);
  };

  // Determine if the message falls within the 30-minute global deletion window
  const isMessageUnder30Mins = (timestamp) => {
    const msgTime = new Date(timestamp).getTime();
    return (Date.now() - msgTime) < 30 * 60 * 1000;
  };

  return (
    <div className="flex-1 flex flex-col h-full relative bg-background">
      
      <header className="h-16 px-6 flex items-center justify-between border-b border-outline-variant/30 glass-panel sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-surface-container-lowest flex items-center justify-center border border-outline-variant/50">
            <span className="material-symbols-outlined font-bold">tag</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-on-surface">{currentRoom}</h2>
            <p className="text-xs text-on-surface-variant">
              {typingUsers.length > 0 ? <span className="text-primary italic">{typingUsers.join(', ')} is typing...</span> : 'Enterprise Real-time Sync'}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32 flex flex-col pt-4 custom-scrollbar" ref={scrollContainerRef}>
        {messages.map((msg, idx) => {
          const isMe = msg.user === currentUser.username;
          if (msg.is_deleted) return <div key={msg.id} className="text-center text-xs text-on-surface-variant italic py-2">This message was deleted.</div>;

          const isMentioned = msg.text && msg.text.includes(`@${currentUser.username}`);

          return (
            <div key={msg.id || idx} className={`flex gap-4 items-end max-w-3xl relative group ${isMe ? 'ml-auto' : ''}`} onMouseEnter={() => setHoveredMsgId(msg.id)} onMouseLeave={() => setHoveredMsgId(null)}>
              
              <div className={`flex flex-col gap-1 w-full ${isMe ? 'items-end' : 'items-start'}`}>
                
                <div className={`flex items-baseline gap-2 ${isMe ? 'mr-1' : 'ml-1'}`}>
                  {!isMe && <span className="font-bold text-sm text-on-surface">{msg.user}</span>}
                  {msg.is_pinned === 1 && <span className="text-yellow-500 text-xs">📌 Pinned</span>}
                  {isMe && <span className="font-bold text-sm text-on-surface">You</span>}
                </div>

                {/* The Bubble - SLACK/TEAMS Relative Container */}
                <div className={`p-4 rounded-2xl border relative shadow-sm ${
                  isMe ? 'bg-gradient-to-br from-primary-container to-inverse-primary text-on-primary-container rounded-br-sm border-primary/20 shadow-[0_4px_24px_rgba(73,143,255,0.2)]' 
                       : 'bg-surface-container text-on-surface rounded-bl-sm border-outline-variant/50'
                } ${msg.is_pinned === 1 ? 'ring-2 ring-yellow-400' : ''} ${isMentioned && !isMe ? 'ring-2 ring-tertiary-container shadow-[0_0_15px_rgba(160,120,255,0.3)]' : ''}`}>
                  
                  {/* Replied Message Block */}
                  {msg.replyTo && (
                    <div className="bg-background/20 border-l-2 border-primary pl-2 py-1 mb-2 rounded text-xs opacity-90 overflow-hidden">
                       <span className="font-bold">{msg.replyTo.user}:</span> <span className="truncate">{msg.replyTo.text}</span>
                    </div>
                  )}

                  {msg.file && msg.file.data && (
                    <div className="mb-2">
                      {msg.file.type.startsWith('image/') ? <img src={msg.file.data} className="max-w-full rounded-lg max-h-64 object-cover" /> : <a href={msg.file.data} download={msg.file.name} className="underline text-sm flex items-center gap-1">📄 {msg.file.name}</a>}
                    </div>
                  )}
                  
                  <p className="whitespace-pre-wrap text-sm">{renderMessageText(msg.text)}</p>
                  
                  {msg.reactions && Object.keys(msg.reactions).some(k => msg.reactions[k]?.length > 0) && (
                    <div className={`flex gap-1 mt-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {Object.entries(msg.reactions).map(([emoji, users]) => users.length > 0 && (
                        <button key={emoji} onClick={() => socket.emit('add reaction', { msgId: msg.id, emoji, username: currentUser.username, roomId: currentRoom })} className={`text-xs px-2 py-1 rounded-full border shadow-sm ${users.includes(currentUser.username) ? 'bg-background text-on-surface border-primary' : 'bg-surface-container-highest text-on-surface border-outline-variant/30'}`}>
                          {emoji} {users.length}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Slack/Teams Style Hover Options Menu (Tightly anchored to bubble top) */}
                  {hoveredMsgId === msg.id && (
                    <div className={`absolute -top-4 ${isMe ? 'left-2' : 'right-2'} bg-surface-container-highest border border-outline-variant/50 shadow-md rounded-lg flex items-center p-0.5 z-30`}>
                      <button onClick={() => socket.emit('add reaction', { msgId: msg.id, emoji: '👍', username: currentUser.username, roomId: currentRoom })} className="p-1 hover:bg-surface-container-low rounded text-on-surface-variant transition-colors" title="React">
                        <span className="material-symbols-outlined text-[18px]">add_reaction</span>
                      </button>
                      <button onClick={() => setReplyingTo({ id: msg.id, user: msg.user, text: msg.text || 'Attachment' })} className="p-1 hover:bg-surface-container-low rounded text-on-surface-variant transition-colors" title="Reply">
                        <span className="material-symbols-outlined text-[18px]">reply</span>
                      </button>
                      <button onClick={() => socket.emit('toggle pin', { msgId: msg.id, room: currentRoom })} className="p-1 hover:bg-surface-container-low rounded text-on-surface-variant transition-colors" title={msg.is_pinned === 1 ? "Unpin" : "Pin"}>
                        <span className="material-symbols-outlined text-[18px]">{msg.is_pinned === 1 ? 'keep_off' : 'keep'}</span>
                      </button>
                      {(isMe || isAdmin) && (
                        <button onClick={() => setDeleteContext({ msgId: msg.id, isMe, timestamp: msg.timestamp })} className="p-1 hover:bg-error-container/30 rounded text-error transition-colors" title="Delete Options">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
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

      <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-background via-background/95 to-transparent pt-10 z-20">
        <div className="max-w-4xl mx-auto relative">
          
          {showMentions && (
            <div className="absolute bottom-full mb-2 left-0 w-64 glass-panel rounded-lg shadow-2xl z-50 overflow-hidden border border-outline-variant/50 max-h-48 overflow-y-auto">
              {mentionOptions.map(u => (
                <div key={u} onClick={() => insertMention(u)} className="p-3 hover:bg-surface-container cursor-pointer flex items-center gap-3 transition-colors border-b border-outline-variant/10">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">{u.charAt(0).toUpperCase()}</div>
                  <span className="text-sm font-bold text-on-surface">{u}</span>
                </div>
              ))}
            </div>
          )}

          <div className="glass-panel rounded-2xl shadow-xl transition-all border border-outline-variant/30 flex flex-col focus-within:border-primary/50">
             
             {/* Reply Context Bar */}
             {replyingTo && (
               <div className="flex items-center justify-between bg-surface-container-lowest/50 px-4 py-2 border-b border-outline-variant/30 text-xs rounded-t-2xl">
                 <div className="flex gap-1 items-center overflow-hidden mr-4">
                    <span className="material-symbols-outlined text-[14px] text-primary">reply</span>
                    <span className="font-bold text-primary whitespace-nowrap">Replying to {replyingTo.user}:</span> 
                    <span className="text-on-surface-variant truncate max-w-[200px] md:max-w-[400px]">{replyingTo.text}</span>
                 </div>
                 <button onClick={() => setReplyingTo(null)} className="text-error font-bold hover:underline">✕</button>
               </div>
             )}

             {/* Attachment Bar */}
             {selectedFile && <div className="bg-surface-container-lowest/50 px-4 py-2 border-b border-outline-variant/30 text-xs flex justify-between"><span>📎 Attached: {selectedFile.name}</span><button onClick={()=>setSelectedFile(null)} className="text-error font-bold hover:underline">Remove</button></div>}
             
             <form onSubmit={handleSendMessage} className="p-2 flex flex-col gap-2 relative">
               <input type="file" ref={fileInputRef} onChange={(e) => setSelectedFile(e.target.files[0])} className="hidden" />
               <textarea 
                 className="w-full bg-transparent border-none text-on-surface text-sm placeholder-on-surface-variant focus:ring-0 resize-none px-4 py-2 outline-none" 
                 placeholder={`Message #${currentRoom}... (Type @ to mention)`} 
                 rows="1" value={inputText} onChange={handleTyping}
                 onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !showMentions) { e.preventDefault(); handleSendMessage(e); } }}
               ></textarea>
               
               <div className="flex items-center justify-between px-2 pb-1">
                 <div className="flex items-center gap-1">
                   <button type="button" onClick={() => fileInputRef.current.click()} className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"><span className="material-symbols-outlined text-[20px]">add_circle</span></button>
                 </div>
                 <div className="flex items-center gap-2">
                   <span className="text-xs text-on-surface-variant hidden sm:inline-block mr-2"><strong>Enter</strong> to send</span>
                   <button type="submit" className="bg-primary hover:bg-primary-container text-on-primary w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-md"><span className="material-symbols-outlined text-[18px]">send</span></button>
                 </div>
               </div>
             </form>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal (Enforces 30-min rule) */}
      {deleteContext && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/50 overflow-hidden max-w-sm w-full p-6">
              <div className="w-12 h-12 rounded-full bg-error/10 text-error flex items-center justify-center mb-4 mx-auto"><span className="material-symbols-outlined text-[24px]">delete</span></div>
              <h3 className="text-lg font-bold text-on-surface mb-2 text-center">Delete Message?</h3>
              <p className="text-sm text-on-surface-variant mb-6 text-center">Select how you want to delete this message.</p>
              
              <div className="flex flex-col gap-3">
                {/* Rule: Can delete for everyone if Admin, OR if it's My message AND sent < 30 mins ago */}
                {((deleteContext.isMe && isMessageUnder30Mins(deleteContext.timestamp)) || isAdmin) && (
                  <button onClick={() => executeDelete('everyone')} className="w-full py-2.5 bg-error/10 text-error font-bold text-sm rounded-xl hover:bg-error/20 transition-colors border border-error/20">
                    Delete for Everyone
                  </button>
                )}
                
                {/* Rule: Can only delete for me if I sent it */}
                {deleteContext.isMe && (
                  <button onClick={() => executeDelete('me')} className="w-full py-2.5 bg-surface-container-highest text-on-surface font-bold text-sm rounded-xl hover:bg-surface-variant border border-outline-variant/30 transition-colors">
                    Delete for Me
                  </button>
                )}

                <button onClick={() => setDeleteContext(null)} className="w-full py-2.5 text-on-surface-variant font-bold text-sm rounded-xl hover:bg-surface-container-lowest transition-colors mt-1">
                  Cancel
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}