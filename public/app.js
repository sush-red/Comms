const socket = io();
let username = "Anonymous";
let userRole = "user"; 
let currentRoom = "General";

let availableUsers = [];
let filteredUsers = [];
let selectedMentionIndex = 0;
let savedCursorPos = 0; 
let unreadMentionsCount = 0;

// NEW: Mute Tracking
const mutedRooms = new Set();

let attachedFileData = null;
let replyingToMessage = null;

// DOM Elements
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

// --- 1. INITIALIZATION & LOGIN ---
joinBtn.addEventListener('click', () => {
  const enteredName = usernameInput.value.trim();
  if (enteredName !== "") {
    username = enteredName;
    userRole = roleInput.value; 
    
    if (userRole === 'admin' || userRole === 'central') {
        createChannelBtn.style.display = 'block';
    }

    loginOverlay.style.display = 'none'; 
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
    
    socket.emit('login', { username: username, role: userRole });
    socket.emit('join room', { room: currentRoom, username: username });
  }
});

socket.on('login success', (data) => {
    data.customChannels.forEach(ch => addChannelToSidebar(ch, channelList));
});

socket.on('room users', (users) => {
    availableUsers = users.filter(u => u !== username);
});

// --- 2. NOTIFICATIONS, MUTE & UNREAD BADGES ---
muteBtn.addEventListener('click', () => {
    if (mutedRooms.has(currentRoom)) {
        mutedRooms.delete(currentRoom);
        muteBtn.textContent = '🔔';
        muteBtn.title = 'Mute Notifications';
        muteBtn.classList.remove('muted');
    } else {
        mutedRooms.add(currentRoom);
        muteBtn.textContent = '🔕';
        muteBtn.title = 'Unmute Notifications';
        muteBtn.classList.add('muted');
    }
});

mentionsHub.addEventListener('click', (e) => {
    const isVisible = mentionsDropdown.style.display === 'flex';
    mentionsDropdown.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
        unreadMentionsCount = 0; 
        mentionsBadge.style.display = 'none';
    }
    e.stopPropagation();
});
document.addEventListener('click', () => mentionsDropdown.style.display = 'none');

function processMentionAlert(data) {
    if (data.user === username) return;
    
    unreadMentionsCount++;
    mentionsBadge.textContent = unreadMentionsCount;
    mentionsBadge.style.display = 'block';
    
    playDing(); // Mentions always ding

    if (Notification.permission === "granted" && document.hidden) {
        new Notification(`Mention from ${data.user}`, { body: data.text });
    }

    const alertDiv = document.createElement('div');
    alertDiv.className = 'mention-alert-item';
    const displayRoomName = data.room.startsWith('DM-') ? 'Direct Message' : `#${data.room}`;
    alertDiv.innerHTML = `<div class="mention-alert-header">${data.user} in ${displayRoomName}</div>${data.text}`;
    
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
            const count = parseInt(badge.textContent || 0) + 1;
            badge.textContent = count;
            badge.style.display = 'inline-block';
        }
    }

    if (data.text && data.text.toLowerCase().includes(`@${username.toLowerCase()}`)) {
        processMentionAlert(data);
    } else if (!mutedRooms.has(data.room) && data.user !== username) {
        playDing(); // Play sound if channel is not muted
    }
});

// --- 3. CHANNEL & DM MANAGEMENT ---
function addChannelToSidebar(roomName, targetList) {
    if (document.querySelector(`.channel-item[data-room="${roomName}"]`)) return; 
    
    const li = document.createElement('li');
    li.className = 'channel-item';
    li.setAttribute('data-room', roomName);
    
    const displayName = roomName.startsWith('DM-') 
        ? `💬 ${roomName.replace('DM-', '').split('-').find(u => u !== username)}` 
        : `# ${roomName}`;
        
    li.innerHTML = `${displayName} <span class="unread-badge">0</span>`;
    li.addEventListener('click', function() { switchRoom(this); });
    targetList.appendChild(li);
    return li;
}

function ensureSidebarItemExists(room, fromUser) {
    if (!document.querySelector(`.channel-item[data-room="${room}"]`)) {
        if (room.startsWith('DM-')) addChannelToSidebar(room, dmList);
        else addChannelToSidebar(room, channelList);
    }
}

function switchRoom(element) {
    document.querySelector('.channel-item.active')?.classList.remove('active');
    element.classList.add('active');
    const newRoom = element.getAttribute('data-room');
    
    const badge = element.querySelector('.unread-badge');
    if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
    
    if (newRoom.startsWith('DM-')) {
        const otherUser = newRoom.replace('DM-', '').split('-').find(u => u !== username);
        headerTitleText.textContent = `💬 ${otherUser}`;
    } else {
        headerTitleText.textContent = `# ${newRoom}`;
    }
    
    // Update the mute UI icon to match the new room's state
    if (mutedRooms.has(newRoom)) {
        muteBtn.textContent = '🔕';
        muteBtn.classList.add('muted');
    } else {
        muteBtn.textContent = '🔔';
        muteBtn.classList.remove('muted');
    }

    messages.innerHTML = ''; 
    socket.emit('join room', { room: newRoom, username: username }); 
    currentRoom = newRoom;
    clearReply(); 
}

document.querySelectorAll('#channel-list .channel-item').forEach(item => {
    item.addEventListener('click', function() { switchRoom(this); });
});

function openDirectMessage(targetUser) {
    const dmRoomId = `DM-${[username, targetUser].sort().join('-')}`;
    ensureSidebarItemExists(dmRoomId, targetUser);
    const targetEl = document.querySelector(`.channel-item[data-room="${dmRoomId}"]`);
    switchRoom(targetEl);
}

// --- 4. ADMIN CUSTOM CHANNELS ---
createChannelBtn.addEventListener('click', () => {
    userSelectList.innerHTML = ''; 
    availableUsers.forEach(u => {
        userSelectList.innerHTML += `
            <label class="user-checkbox-item">
                <input type="checkbox" value="${u}"> ${u}
            </label>`;
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

socket.on('new custom channel', (channelName) => {
    addChannelToSidebar(channelName, channelList);
});

// --- 5. @ MENTIONS AUTOCOMPLETE ---
input.addEventListener('keyup', () => { savedCursorPos = input.selectionStart; });
input.addEventListener('click', () => { savedCursorPos = input.selectionStart; });

input.addEventListener('input', () => {
  savedCursorPos = input.selectionStart;
  const val = input.value;
  const match = val.substring(0, savedCursorPos).match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);

  if (match) {
    const searchTerm = match[1].toLowerCase();
    filteredUsers = availableUsers.filter(u => u.toLowerCase().startsWith(searchTerm));
    if (filteredUsers.length > 0) buildMentionDropdown();
    else closeMentionDropdown();
  } else closeMentionDropdown();
});

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

// --- 6. ATTACHMENTS & REPLIES ---
document.getElementById('attach-btn').addEventListener('click', () => { document.getElementById('file-input').click(); });

window.clearAttachment = function() {
  attachedFileData = null;
  document.getElementById('attachment-preview').style.display = 'none';
  document.getElementById('file-input').value = ''; 
};

window.clearReply = function() {
  replyingToMessage = null;
  document.getElementById('reply-preview').style.display = 'none';
};

function setReply(data, previewText) {
  replyingToMessage = { id: data.id, user: data.user, text: previewText.length > 50 ? previewText.substring(0, 50) + '...' : previewText };
  document.getElementById('reply-preview').innerHTML = `<button type="button" class="cancel-reply-btn" onclick="clearReply()">×</button><strong>Replying to ${data.user}</strong><br/>${replyingToMessage.text}`;
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
    document.getElementById('attachment-preview').innerHTML = `📎 ${file.name} <button type="button" class="cancel-attach-btn" onclick="clearAttachment()" title="Remove attachment">×</button>`;
    document.getElementById('attachment-preview').style.display = 'inline-flex';
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

// --- 7. MESSAGE RENDERING ---
function displayMessage(data, isHistory = false) {
  const container = document.createElement('li');
  container.className = 'message-container';
  
  const isMe = (data.user === username);
  if (isMe) container.classList.add('me'); 

  const messageId = data.id || Math.random().toString(36).substr(2, 9);
  container.id = `msg-${messageId}`;
  
  const senderWrapper = document.createElement('div');
  senderWrapper.className = 'message-sender-wrapper';

  const sender = document.createElement('div');
  sender.className = 'message-sender';
  sender.textContent = isMe ? 'Me' : data.user;
  senderWrapper.appendChild(sender);

  if (!isMe) {
      const hoverDmBtn = document.createElement('button');
      hoverDmBtn.className = 'dm-hover-btn';
      hoverDmBtn.textContent = '💬 Message';
      hoverDmBtn.addEventListener('click', () => openDirectMessage(data.user));
      senderWrapper.appendChild(hoverDmBtn);
  }
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  
  if (data.replyTo) {
      const quoteDiv = document.createElement('div');
      quoteDiv.className = 'reply-quote';
      quoteDiv.addEventListener('click', () => {
          const originalMsg = document.getElementById(`msg-${data.replyTo.id}`);
          if (originalMsg) {
              originalMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
              originalMsg.style.transition = 'background 0.5s'; originalMsg.style.backgroundColor = '#ffeaa7';
              setTimeout(() => originalMsg.style.backgroundColor = 'transparent', 1500);
          }
      });
      quoteDiv.innerHTML = `<div class="reply-quote-sender">${data.replyTo.user}</div><div>${data.replyTo.text}</div>`;
      bubble.appendChild(quoteDiv);
  }
  
  if (data.text) {
      const textDiv = document.createElement('div');
      textDiv.textContent = data.text;
      
      if (data.text.toLowerCase().includes(`@${username.toLowerCase()}`)) {
        bubble.classList.add('mentioned'); 
        if (!isMe && !isHistory) processMentionAlert(data); // Don't trigger alert on history
      } else if (!isMe && !mutedRooms.has(currentRoom) && !isHistory) {
        // NEW: Only play sound if NOT loading history
        playDing();
      }
      bubble.appendChild(textDiv);
  } else if (!isMe && !mutedRooms.has(currentRoom) && !isHistory) {
      // Play sound for files only if NOT loading history
      playDing();
  }
  if (data.file) {
      if (data.file.type.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = data.file.data; img.className = 'message-image';
          img.addEventListener('click', () => window.open(data.file.data, '_blank'));
          bubble.appendChild(img);
      } else {
          const link = document.createElement('a');
          link.href = data.file.data; link.download = data.file.name;
          link.textContent = `📄 Download ${data.file.name}`; link.className = 'message-file';
          bubble.appendChild(link);
      }
  }
  
  container.appendChild(senderWrapper);
  container.appendChild(bubble);

  const reactionBar = document.createElement('div');
  reactionBar.className = 'reaction-bar';
  
  const replyBtn = document.createElement('button');
  replyBtn.className = 'reaction-btn'; replyBtn.innerHTML = '↩️'; replyBtn.title = 'Reply';
  replyBtn.addEventListener('click', () => {
      setReply(data, data.text ? data.text : (data.file ? `[Attachment: ${data.file.name}]` : 'Message'));
  });
  reactionBar.appendChild(replyBtn);

  const emojis = ['👍', '👎', '❤️', '✅', '👀'];
  
  emojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'reaction-btn'; btn.id = `btn-${messageId}-${emoji}`; 
    
    const usersArray = data.reactions && data.reactions[emoji] ? data.reactions[emoji] : [];
    const count = usersArray.length;
    
    const tooltip = document.createElement('div');
    tooltip.className = 'reaction-tooltip'; tooltip.id = `tooltip-${messageId}-${emoji}`;
    
    if (count > 0) {
      btn.classList.add('has-reactions');
      tooltip.innerHTML = usersArray.map(u => `<div class="tooltip-row">${u}</div>`).join('');
    } else {
      tooltip.innerHTML = `<div class="tooltip-row">React with ${emoji}</div>`;
    }
    
    btn.innerHTML = `${emoji} <span class="reaction-count" id="count-${messageId}-${emoji}">${count > 0 ? count : ''}</span>`;
    btn.appendChild(tooltip); 
    
    btn.addEventListener('click', () => {
      socket.emit('add reaction', {
        roomId: currentRoom,
        msgId: messageId,
        emoji: emoji,
        username: username
      });
    });
    
    reactionBar.appendChild(btn);
  });

  container.appendChild(reactionBar);
  messages.appendChild(container);
  messages.scrollTop = messages.scrollHeight;
}

form.addEventListener('submit', function(e) {
  e.preventDefault();
  
  const textVal = input.value.trim();
  
  if (mentionDropdown.style.display !== 'block' && (textVal !== '' || attachedFileData !== null)) {
    const payload = { user: username, text: textVal, room: currentRoom };
    
    if (attachedFileData !== null) payload.file = attachedFileData;
    if (replyingToMessage !== null) payload.replyTo = replyingToMessage;
    
    socket.emit('chat message', payload);
    
    input.value = ''; clearAttachment(); clearReply(); closeMentionDropdown();
  }
});

socket.on('chat message', function(data) { displayMessage(data, false); });
socket.on('chat history', function(historyArray) { 
    historyArray.forEach(messageData => displayMessage(messageData, true)); 
});

socket.on('update reaction', function(data) {
  const btn = document.getElementById(`btn-${data.msgId}-${data.emoji}`);
  const countSpan = document.getElementById(`count-${data.msgId}-${data.emoji}`);
  const tooltip = document.getElementById(`tooltip-${data.msgId}-${data.emoji}`);
  
  if (btn && countSpan && tooltip) {
    const count = data.users.length;
    countSpan.textContent = count > 0 ? count : '';
    
    if (count > 0) {
      btn.classList.add('has-reactions');
      tooltip.innerHTML = data.users.map(u => `<div class="tooltip-row">${u}</div>`).join('');
    } else {
      btn.classList.remove('has-reactions');
      tooltip.innerHTML = `<div class="tooltip-row">React with ${data.emoji}</div>`;
    }
  }
});