const socket = io();
let username = "Anonymous";
let userRole = "user"; 
let currentRoom = "General";

let availableUsers = [];
let filteredUsers = [];
let selectedMentionIndex = 0;
let savedCursorPos = 0; 
let unreadMentionsCount = 0;
const mutedRooms = new Set();

// Pagination State
let currentOffset = 0;
let isFetchingHistory = false;
let hasMoreHistory = true;

// Typing State
let typingTimeout = null;

let attachedFileData = null;
let replyingToMessage = null;

const loginOverlay = document.getElementById('login-overlay');
const usernameInput = document.getElementById('username-input');
const roleInput = document.getElementById('role-input');
const joinBtn = document.getElementById('join-btn');

const channelList = document.getElementById('channel-list');
const dmList = document.getElementById('dm-list');
const createChannelBtn = document.getElementById('create-channel-btn');
const createChannelOverlay = document.getElementById('create-channel-overlay');
const userSelectList = document.getElementById('user-select-list');

const mentionsHub = document.getElementById('mentions-hub');
const mentionsDropdown = document.getElementById('mentions-dropdown');
const mentionsBadge = document.getElementById('mentions-badge');
const muteBtn = document.getElementById('mute-btn');

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const headerTitleText = document.getElementById('header-title-text');
const mentionDropdown = document.getElementById('mention-dropdown');
const typingIndicator = document.getElementById('typing-indicator');
const typingText = document.getElementById('typing-text');

// Search Elements
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

joinBtn.addEventListener('click', () => {
  const enteredName = usernameInput.value.trim();
  if (enteredName !== "") {
    username = enteredName;
    userRole = roleInput.value; 
    if (userRole === 'admin' || userRole === 'central') createChannelBtn.style.display = 'block';
    loginOverlay.style.display = 'none'; 
    if (Notification.permission !== "granted" && Notification.permission !== "denied") Notification.requestPermission();
    socket.emit('login', { username: username, role: userRole });
    joinRoom(currentRoom);
  }
});

socket.on('login success', (data) => {
    data.customChannels.forEach(ch => addChannelToSidebar(ch, channelList));
});

socket.on('room users', (users) => {
    availableUsers = users.filter(u => u !== username);
    updateOnlineStatusUI();
});

// UPGRADED: Add green dot for online users
function updateOnlineStatusUI() {
    document.querySelectorAll('#dm-list .channel-item').forEach(item => {
        const roomName = item.getAttribute('data-room');
        const dmUser = roomName.replace('DM-', '').split('-').find(u => u !== username);
        const nameSpan = item.querySelector('.dm-name-span');
        
        if (nameSpan) {
            if (availableUsers.includes(dmUser)) {
                if (!nameSpan.innerHTML.includes('bg-green-500')) {
                    nameSpan.innerHTML += ` <span class="inline-block w-2 h-2 bg-green-500 rounded-full ml-1"></span>`;
                }
            } else {
                nameSpan.innerHTML = nameSpan.innerHTML.replace(/<span class="inline-block w-2 h-2 bg-green-500 rounded-full ml-1"><\/span>/g, '');
            }
        }
    });
}

muteBtn.addEventListener('click', () => {
    const icon = muteBtn.querySelector('span');
    if (mutedRooms.has(currentRoom)) {
        mutedRooms.delete(currentRoom);
        icon.textContent = 'notifications';
        muteBtn.classList.remove('text-unread-coral');
    } else {
        mutedRooms.add(currentRoom);
        icon.textContent = 'notifications_off';
        muteBtn.classList.add('text-unread-coral');
    }
});

mentionsHub.addEventListener('click', (e) => {
    const isVisible = mentionsDropdown.style.display === 'flex';
    mentionsDropdown.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) { unreadMentionsCount = 0; mentionsBadge.style.display = 'none'; }
    e.stopPropagation();
});
document.addEventListener('click', () => {
    mentionsDropdown.style.display = 'none';
    searchResults.style.display = 'none';
});

function processMentionAlert(data) {
    if (data.user === username) return;
    unreadMentionsCount++;
    mentionsBadge.textContent = unreadMentionsCount;
    mentionsBadge.style.display = 'flex';
    playDing();
    if (Notification.permission === "granted" && document.hidden) new Notification(`Mention from ${data.user}`, { body: data.text });

    const alertDiv = document.createElement('div');
    alertDiv.className = 'p-3 border-b border-border-subtle font-body-sm text-on-surface cursor-pointer hover:bg-surface-container-low transition-colors';
    const displayRoomName = data.room.startsWith('DM-') ? 'Direct Message' : `#${data.room}`;
    alertDiv.innerHTML = `<div class="font-bold text-primary mb-1">${data.user} in ${displayRoomName}</div>${data.text}`;
    alertDiv.addEventListener('click', () => {
        ensureSidebarItemExists(data.room, data.user);
        const targetEl = document.querySelector(`.channel-item[data-room="${data.room}"]`);
        if (targetEl) switchRoom(targetEl);
    });
    mentionsDropdown.prepend(alertDiv);
}

socket.on('unread alert', (data) => {
    if (data.room === currentRoom) return; 
    ensureSidebarItemExists(data.room, data.user);
    const targetEl = document.querySelector(`.channel-item[data-room="${data.room}"]`);
    if (targetEl) {
        let badge = targetEl.querySelector('.unread-badge');
        if (badge) {
            badge.textContent = parseInt(badge.textContent || 0) + 1;
            badge.style.display = 'inline-block';
        }
    }
    if (data.text && data.text.toLowerCase().includes(`@${username.toLowerCase()}`)) processMentionAlert(data);
    else if (!mutedRooms.has(data.room) && data.user !== username) playDing(); 
});

function addChannelToSidebar(roomName, targetList) {
    if (document.querySelector(`.channel-item[data-room="${roomName}"]`)) return; 
    
    const li = document.createElement('li');
    li.className = 'channel-item flex items-center justify-between gap-3 text-on-secondary/70 px-3 py-2 hover:bg-on-secondary-container/10 rounded-lg cursor-pointer border-l-4 border-transparent';
    li.setAttribute('data-room', roomName);
    
    const isDM = roomName.startsWith('DM-');
    const dmUser = isDM ? roomName.replace('DM-', '').split('-').find(u => u !== username) : '';
    const displayName = isDM ? `💬 <span class="dm-name-span">${dmUser}</span>` : `# ${roomName}`;
        
    li.innerHTML = `<div class="flex items-center gap-3"><span class="font-label-md text-label-md">${displayName}</span></div> <span class="unread-badge bg-unread-coral text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center" style="display: none;">0</span>`;
    li.addEventListener('click', function() { switchRoom(this); });
    targetList.appendChild(li);
    
    if (isDM) updateOnlineStatusUI();
    return li;
}

function ensureSidebarItemExists(room, fromUser) {
    if (!document.querySelector(`.channel-item[data-room="${room}"]`)) {
        if (room.startsWith('DM-')) addChannelToSidebar(room, dmList);
        else addChannelToSidebar(room, channelList);
    }
}

function joinRoom(newRoom) {
    currentOffset = 0;
    hasMoreHistory = true;
    messages.innerHTML = ''; 
    socket.emit('join room', { room: newRoom, username: username }); 
    currentRoom = newRoom;
}

function switchRoom(element) {
    const activeEl = document.querySelector('.channel-item.bg-secondary');
    if (activeEl) {
        activeEl.classList.remove('bg-secondary', 'border-primary', 'text-on-secondary');
        activeEl.classList.add('text-on-secondary/70', 'border-transparent');
    }
    element.classList.remove('text-on-secondary/70', 'border-transparent');
    element.classList.add('bg-secondary', 'border-primary', 'text-on-secondary');

    const newRoom = element.getAttribute('data-room');
    const badge = element.querySelector('.unread-badge');
    if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
    
    if (newRoom.startsWith('DM-')) {
        const otherUser = newRoom.replace('DM-', '').split('-').find(u => u !== username);
        headerTitleText.textContent = `💬 ${otherUser}`;
    } else {
        headerTitleText.textContent = `# ${newRoom}`;
    }
    
    const icon = muteBtn.querySelector('span');
    if (mutedRooms.has(newRoom)) {
        icon.textContent = 'notifications_off';
        muteBtn.classList.add('text-unread-coral');
    } else {
        icon.textContent = 'notifications';
        muteBtn.classList.remove('text-unread-coral');
    }
    clearReply(); 
    joinRoom(newRoom);
}

// NEW: Infinite Scroll Pagination Logic
messages.addEventListener('scroll', () => {
    if (messages.scrollTop === 0 && !isFetchingHistory && hasMoreHistory) {
        isFetchingHistory = true;
        currentOffset += 50;
        socket.emit('load more messages', { room: currentRoom, offset: currentOffset });
    }
});

document.querySelectorAll('.channel-item').forEach(item => { item.addEventListener('click', function() { switchRoom(this); }); });

function openDirectMessage(targetUser) {
    const dmRoomId = `DM-${[username, targetUser].sort().join('-')}`;
    ensureSidebarItemExists(dmRoomId, targetUser);
    const targetEl = document.querySelector(`.channel-item[data-room="${dmRoomId}"]`);
    switchRoom(targetEl);
}

// NEW: Enterprise Search Logic
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
    }
    searchTimeout = setTimeout(() => {
        socket.emit('search messages', query);
    }, 300); // Debounce to prevent spamming DB
});

searchResults.addEventListener('click', (e) => e.stopPropagation());

socket.on('search results', (results) => {
    searchResults.innerHTML = '';
    if (results.length === 0) {
        searchResults.innerHTML = '<div class="p-4 text-on-surface-variant font-body-sm text-center">No results found.</div>';
    } else {
        results.forEach(msg => {
            const resDiv = document.createElement('div');
            resDiv.className = 'p-3 hover:bg-surface-container-low rounded cursor-pointer transition-colors border-b border-border-subtle last:border-0';
            const displayRoom = msg.room.startsWith('DM-') ? 'DM' : `#${msg.room}`;
            resDiv.innerHTML = `
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-on-surface text-sm">${msg.user}</span>
                    <span class="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">${displayRoom}</span>
                </div>
                <div class="text-on-surface-variant text-xs line-clamp-2">${msg.text || '[Attachment]'}</div>
            `;
            resDiv.addEventListener('click', () => {
                ensureSidebarItemExists(msg.room, msg.user);
                const targetEl = document.querySelector(`.channel-item[data-room="${msg.room}"]`);
                if (targetEl) switchRoom(targetEl);
                searchResults.style.display = 'none';
                searchInput.value = '';
            });
            searchResults.appendChild(resDiv);
        });
    }
    searchResults.style.display = 'flex';
});

createChannelBtn.addEventListener('click', () => {
    userSelectList.innerHTML = ''; 
    availableUsers.forEach(u => {
        userSelectList.innerHTML += `<label class="flex items-center gap-2 mb-1 text-sm cursor-pointer hover:bg-white p-1 rounded"><input type="checkbox" value="${u}"> ${u}</label>`;
    });
    createChannelOverlay.style.display = 'flex';
});

document.getElementById('submit-channel-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('new-channel-name').value.trim().replace(/\s+/g, '-');
    if (!nameInput) return;
    const selectedUsers = Array.from(userSelectList.querySelectorAll('input:checked')).map(cb => cb.value);
    selectedUsers.push(username); 
    socket.emit('create custom channel', { name: nameInput, members: selectedUsers });
    createChannelOverlay.style.display = 'none';
    document.getElementById('new-channel-name').value = '';
});

socket.on('new custom channel', (channelName) => { addChannelToSidebar(channelName, channelList); });

// NEW: Typing Event Listener
input.addEventListener('input', () => {
    // Mentions logic
    savedCursorPos = input.selectionStart;
    const val = input.value;
    const match = val.substring(0, savedCursorPos).match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    if (match) {
        const searchTerm = match[1].toLowerCase();
        filteredUsers = availableUsers.filter(u => u.toLowerCase().startsWith(searchTerm));
        if (filteredUsers.length > 0) buildMentionDropdown();
        else closeMentionDropdown();
    } else closeMentionDropdown();

    // Broadcast Typing Status
    socket.emit('typing', { room: currentRoom, username: username });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop typing', { room: currentRoom, username: username });
    }, 1500);
});

// Listen for typing events
socket.on('user typing', (typist) => {
    typingText.textContent = `${typist} is typing...`;
    typingIndicator.classList.remove('hidden');
});
socket.on('user stopped typing', () => {
    typingIndicator.classList.add('hidden');
});

// Mention Builder functions...
function buildMentionDropdown() {
  mentionDropdown.innerHTML = '';
  mentionDropdown.style.display = 'block';
  if (selectedMentionIndex >= filteredUsers.length) selectedMentionIndex = 0;
  filteredUsers.forEach((user, index) => {
    const item = document.createElement('div');
    item.className = 'mention-item';
    item.innerHTML = `<div class="mention-avatar">${user.charAt(0).toUpperCase()}</div><span>${user}</span>`;
    item.addEventListener('mousedown', (e) => { e.preventDefault(); });
    item.addEventListener('click', () => { insertMention(user); });
    item.addEventListener('mouseenter', () => { selectedMentionIndex = index; updateActiveHighlight(); });
    mentionDropdown.appendChild(item);
  });
  updateActiveHighlight(); 
}

function updateActiveHighlight() {
  const items = mentionDropdown.querySelectorAll('.mention-item');
  items.forEach((item, index) => {
    if (index === selectedMentionIndex) {
      item.classList.add('active'); item.scrollIntoView({ block: 'nearest' });
    } else item.classList.remove('active');
  });
}

function closeMentionDropdown() {
  mentionDropdown.style.display = 'none'; filteredUsers = []; selectedMentionIndex = 0;
}

function insertMention(userToTag) {
  const val = input.value;
  const match = val.substring(0, savedCursorPos).match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
  if (match) {
    const startPos = match.index + (match[0].startsWith(' ') ? 1 : 0);
    input.value = val.substring(0, startPos) + `@${userToTag} ` + val.substring(savedCursorPos);
    input.focus();
    input.selectionStart = input.selectionEnd = savedCursorPos = startPos + userToTag.length + 2; 
  }
  closeMentionDropdown();
}

input.addEventListener('keydown', (e) => {
  if (mentionDropdown.style.display === 'block') {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedMentionIndex = (selectedMentionIndex + 1) % filteredUsers.length; updateActiveHighlight(); } 
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedMentionIndex = (selectedMentionIndex - 1 + filteredUsers.length) % filteredUsers.length; updateActiveHighlight(); } 
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (filteredUsers[selectedMentionIndex]) insertMention(filteredUsers[selectedMentionIndex]); } 
    else if (e.key === 'Escape') closeMentionDropdown();
  }
});

document.getElementById('attach-btn').addEventListener('click', () => { document.getElementById('file-input').click(); });
window.clearAttachment = function() { attachedFileData = null; document.getElementById('attachment-preview').style.display = 'none'; document.getElementById('file-input').value = ''; };
window.clearReply = function() { replyingToMessage = null; document.getElementById('reply-preview').style.display = 'none'; };

function setReply(data, previewText) {
  replyingToMessage = { id: data.id, user: data.user, text: previewText.length > 50 ? previewText.substring(0, 50) + '...' : previewText };
  document.getElementById('reply-preview').innerHTML = `<button type="button" class="float-right text-error font-bold" onclick="clearReply()">×</button><strong>Replying to ${data.user}</strong><br/><span class="text-on-surface-variant">${replyingToMessage.text}</span>`;
  document.getElementById('reply-preview').style.display = 'block';
  input.focus();
}

document.getElementById('file-input').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert("File must be under 2MB."); this.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    attachedFileData = { name: file.name, type: file.type, data: e.target.result };
    document.getElementById('attachment-preview').innerHTML = `<span class="material-symbols-outlined text-[16px]">attach_file</span> ${file.name} <button type="button" class="text-error ml-2" onclick="clearAttachment()">×</button>`;
    document.getElementById('attachment-preview').style.display = 'flex';
  };
  reader.readAsDataURL(file); 
});

function playDing() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); 
  oscillator.connect(gainNode); gainNode.connect(audioCtx.destination);
  oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.15); 
}

function displayMessage(data, isHistory = false, prepend = false) {
  const container = document.createElement('li');
  const isMe = (data.user === username);
  container.className = isMe ? 'flex items-end justify-end gap-3 max-w-[85%] self-end group' : 'flex items-end gap-3 max-w-[85%] group';
  const messageId = data.id || Math.random().toString(36).substr(2, 9);
  container.id = `msg-${messageId}`;
  
  const contentCol = document.createElement('div');
  contentCol.className = isMe ? 'flex flex-col gap-1 items-end' : 'flex flex-col gap-1';

  const nameRow = document.createElement('div');
  nameRow.className = isMe ? 'flex items-baseline gap-2 mr-1' : 'flex items-baseline gap-2 ml-1';
  const senderName = document.createElement('span');
  senderName.className = 'font-label-md text-label-md text-on-surface cursor-pointer hover:underline';
  senderName.textContent = isMe ? 'You' : data.user;
  if (!isMe) senderName.addEventListener('click', () => openDirectMessage(data.user));
  nameRow.appendChild(senderName);
  contentCol.appendChild(nameRow);
  
  const bubble = document.createElement('div');
  bubble.className = isMe ? 'bg-outgoing-blue text-on-surface p-3 md:p-4 rounded-bubble-outgoing border border-primary/10 relative shadow-sm' : 'bg-surface-container-lowest text-on-surface p-3 md:p-4 rounded-bubble-incoming shadow-ambient border border-border-subtle/50 relative';
  
  if (data.replyTo) {
      const quoteDiv = document.createElement('div');
      quoteDiv.className = 'bg-white/60 border-l-2 border-primary pl-3 pr-2 py-2 mb-2 rounded-r-md text-sm cursor-pointer hover:bg-white/80 transition-colors';
      quoteDiv.addEventListener('click', () => {
          const originalMsg = document.getElementById(`msg-${data.replyTo.id}`);
          if (originalMsg) {
              originalMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
              originalMsg.classList.add('ring-2', 'ring-primary', 'transition-all');
              setTimeout(() => originalMsg.classList.remove('ring-2', 'ring-primary'), 1500);
          }
      });
      quoteDiv.innerHTML = `<p class="font-label-sm text-primary mb-1">${data.replyTo.user}</p><p class="font-body-sm text-on-surface-variant line-clamp-1">${data.replyTo.text}</p>`;
      bubble.appendChild(quoteDiv);
  }
  
  if (data.text) {
      const textDiv = document.createElement('p');
      textDiv.className = 'font-body-md text-body-md';
      if (data.text.toLowerCase().includes(`@${username.toLowerCase()}`)) {
        bubble.classList.add('ring-2', 'ring-mention-gold'); 
        if (!isMe && !isHistory) processMentionAlert(data);
      } else if (!isMe && !mutedRooms.has(currentRoom) && !isHistory) playDing(); 
      textDiv.textContent = data.text;
      bubble.appendChild(textDiv);
  } else if (!isMe && !mutedRooms.has(currentRoom) && !isHistory) playDing(); 
  
  if (data.file) {
      if (data.file.type.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = data.file.data; img.className = 'max-w-[250px] rounded-lg mt-2 cursor-pointer border border-border-subtle';
          img.addEventListener('click', () => window.open(data.file.data, '_blank'));
          bubble.appendChild(img);
      } else {
          const link = document.createElement('div');
          link.className = 'bg-surface-container-low border border-border-subtle rounded-lg p-3 flex items-center gap-4 cursor-pointer hover:bg-surface-container transition-colors mt-2';
          link.innerHTML = `<div class="w-10 h-10 bg-primary/10 rounded flex items-center justify-center text-primary"><span class="material-symbols-outlined fill">insert_drive_file</span></div><div class="flex-1"><h4 class="font-label-md text-label-md text-on-surface">${data.file.name}</h4></div><a href="${data.file.data}" download="${data.file.name}" class="text-on-surface-variant hover:text-primary"><span class="material-symbols-outlined">download</span></a>`;
          bubble.appendChild(link);
      }
  }

  const hoverActions = document.createElement('div');
  hoverActions.className = `absolute -top-3 ${isMe ? '-left-3' : '-right-3'} bg-surface border border-border-subtle rounded-lg shadow-sm flex items-center p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10`;
  const replyBtn = document.createElement('button');
  replyBtn.className = 'p-1.5 hover:bg-surface-container-low rounded-md text-on-surface-variant hover:text-primary transition-colors';
  replyBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">reply</span>';
  replyBtn.addEventListener('click', () => setReply(data, data.text ? data.text : (data.file ? `[Attachment: ${data.file.name}]` : 'Message')));
  hoverActions.appendChild(replyBtn);
  bubble.appendChild(hoverActions);
  
  contentCol.appendChild(bubble);
  
  const reactionBar = document.createElement('div');
  reactionBar.className = 'flex gap-1 mt-1 min-h-[24px]';
  const emojis = ['👍', '👎', '❤️', '✅', '👀'];
  emojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'relative bg-surface-container-lowest border border-border-subtle rounded-full px-2 py-0.5 text-xs cursor-pointer hover:bg-surface-container-low hidden group/react';
    btn.id = `btn-${messageId}-${emoji}`; 
    const usersArray = data.reactions && data.reactions[emoji] ? data.reactions[emoji] : [];
    const count = usersArray.length;
    const tooltip = document.createElement('div');
    tooltip.className = 'absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-sidebar-bg text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover/react:opacity-100 pointer-events-none whitespace-nowrap z-20';
    tooltip.id = `tooltip-${messageId}-${emoji}`;
    
    if (count > 0) {
      btn.classList.remove('hidden'); btn.classList.add('flex', 'items-center', 'gap-1');
      if (usersArray.includes(username)) btn.classList.add('bg-primary/10', 'border-primary/30');
      tooltip.innerHTML = usersArray.join(', ');
    } else tooltip.innerHTML = `React with ${emoji}`;
    
    btn.innerHTML = `${emoji} <span class="font-bold text-on-surface-variant" id="count-${messageId}-${emoji}">${count > 0 ? count : ''}</span>`;
    btn.appendChild(tooltip); 
    btn.addEventListener('click', () => socket.emit('add reaction', { roomId: currentRoom, msgId: messageId, emoji: emoji, username: username }));
    container.addEventListener('mouseenter', () => btn.classList.remove('hidden'));
    container.addEventListener('mouseleave', () => { if (parseInt(document.getElementById(`count-${messageId}-${emoji}`).textContent || 0) === 0) btn.classList.add('hidden'); });
    reactionBar.appendChild(btn);
  });

  contentCol.appendChild(reactionBar);

  if (!isMe) {
      const avatarDiv = document.createElement('div');
      avatarDiv.className = 'w-8 h-8 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center text-primary font-bold mb-6';
      avatarDiv.textContent = data.user.charAt(0).toUpperCase();
      container.appendChild(avatarDiv);
  }
  
  container.appendChild(contentCol);

  // Pagination Logic: Prepend or Append
  if (prepend) {
      messages.prepend(container);
  } else {
      messages.appendChild(container);
      messages.scrollTop = messages.scrollHeight;
  }
}

form.addEventListener('submit', function(e) {
  e.preventDefault();
  const textVal = input.value.trim();
  if (mentionDropdown.style.display !== 'block' && (textVal !== '' || attachedFileData !== null)) {
    const payload = { user: username, text: textVal, room: currentRoom };
    if (attachedFileData !== null) payload.file = attachedFileData;
    if (replyingToMessage !== null) payload.replyTo = replyingToMessage;
    
    socket.emit('chat message', payload);
    // Clear typing indicator immediately on send
    socket.emit('stop typing', { room: currentRoom, username: username });
    input.value = ''; clearAttachment(); clearReply(); closeMentionDropdown();
  }
});

socket.on('chat message', function(data) { displayMessage(data, false, false); });

socket.on('chat history', function(historyArray) { 
    if (historyArray.length < 50) hasMoreHistory = false;
    historyArray.forEach(messageData => displayMessage(messageData, true, false)); 
});

// NEW: Handle Pagination Results
socket.on('older messages', function(historyArray) {
    if (historyArray.length < 50) hasMoreHistory = false;
    
    const previousScrollHeight = messages.scrollHeight;
    
    // Reverse the array again so they prepend in the correct chronological order
    historyArray.reverse().forEach(messageData => displayMessage(messageData, true, true));
    
    // Adjust scroll position so the screen doesn't jump to the top
    messages.scrollTop = messages.scrollHeight - previousScrollHeight;
    isFetchingHistory = false;
});

socket.on('update reaction', function(data) {
  const btn = document.getElementById(`btn-${data.msgId}-${data.emoji}`);
  const countSpan = document.getElementById(`count-${data.msgId}-${data.emoji}`);
  const tooltip = document.getElementById(`tooltip-${data.msgId}-${data.emoji}`);
  if (btn && countSpan && tooltip) {
    const count = data.users.length;
    countSpan.textContent = count > 0 ? count : '';
    if (count > 0) {
      btn.classList.remove('hidden'); btn.classList.add('flex', 'items-center', 'gap-1');
      if (data.users.includes(username)) btn.classList.add('bg-primary/10', 'border-primary/30');
      else btn.classList.remove('bg-primary/10', 'border-primary/30');
      tooltip.innerHTML = data.users.join(', ');
    } else {
      btn.classList.remove('flex', 'items-center', 'gap-1', 'bg-primary/10', 'border-primary/30');
      btn.classList.add('hidden');
      tooltip.innerHTML = `React with ${data.emoji}`;
    }
  }
});