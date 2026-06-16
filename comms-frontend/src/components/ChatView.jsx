import { useState, useEffect, useRef } from 'react';
import socket from '../socket';

export default function ChatView({ currentRoom, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef(null);

  // Auto-scroll to the bottom when a new message arrives
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // 1. Ask the server to join the room and get history
    socket.emit('join room', { room: currentRoom, username: currentUser.username });

    // 2. Listen for the chat history payload
    socket.on('chat history', (history) => {
      setMessages(history);
      scrollToBottom();
    });

    // 3. Listen for brand new messages
    socket.on('chat message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      scrollToBottom();
    });

    // Cleanup listeners when switching rooms
    return () => {
      socket.off('chat history');
      socket.off('chat message');
    };
  }, [currentRoom, currentUser.username]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    socket.emit('chat message', {
      user: currentUser.username,
      text: inputText,
      room: currentRoom
    });
    
    setInputText("");
  };

  return (
    <div className="flex-1 flex flex-col bg-background h-screen relative">
      {/* Header */}
      <header className="bg-surface shadow-sm px-6 py-4 flex items-center gap-3 border-b border-border-subtle z-10">
        <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary font-bold">#</div>
        <h2 className="text-xl font-bold text-on-surface">{currentRoom}</h2>
      </header>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 chat-scroll pb-24">
        {messages.map((msg, idx) => {
          const isMe = msg.user === currentUser.username;
          return (
            <div key={msg.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <span className="text-xs font-bold text-on-surface-variant mb-1 mx-1">
                {isMe ? 'You' : msg.user}
              </span>
              <div className={`p-3 max-w-[75%] shadow-sm ${
                isMe 
                  ? 'bg-primary text-on-primary rounded-[16px_16px_4px_16px]' 
                  : 'bg-white text-on-surface rounded-[16px_16px_16px_4px] border border-border-subtle'
              }`}>
                <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent pt-10">
        <form onSubmit={handleSendMessage} className="bg-white border border-border-subtle rounded-xl shadow-md p-2 flex items-center gap-2">
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Message #${currentRoom}...`}
            className="flex-1 bg-transparent border-none outline-none px-3 py-2 text-on-surface"
          />
          <button type="submit" className="bg-primary text-white p-2 px-4 rounded-lg font-bold hover:bg-primary/90 transition-colors">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}