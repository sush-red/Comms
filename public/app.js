const socket = io();
let username = "Anonymous";
let userRole = "user"; 
let currentRoom = "General";

let availableUsers = []; 
let mentionableUsers = []; 
let filteredUsers = [];
let selectedMentionIndex = 0;
let savedCursorPos = 0; 
let unreadMentionsCount = 0;
const mutedRooms = new Set();

let currentOffset = 0;
let isFetchingHistory = false;
let hasMoreHistory = true;
let typingTimeout = null;

let attachedFileData = null;
let replyingToMessage = null;
let pinnedMessagesMap = new Map(); 

// Views
const chatView = document.getElementById('chat-view');
const calendarView = document.getElementById('calendar-view');
const navChatBtn = document.getElementById('nav-chat-btn');
const navCalendarBtn = document.getElementById('nav-calendar-btn');
const sidebarListsContainer = document.getElementById('sidebar-lists-container');
const sidebarCalendarContainer = document.getElementById('sidebar-calendar-container');

// Chat UI DOM
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
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

const mainContent = document.querySelector('#chat-view');
const header = mainContent.querySelector('header');
const pinnedBanner = document.createElement('div');
pinnedBanner.id = 'pinned-banner';
pinnedBanner.className = 'hidden bg-surface-container border-b border-border-subtle p-2 flex-col gap-1 text-sm z-10 w-full max-h-[150px] overflow-y-auto shadow-sm';
mainContent.insertBefore(pinnedBanner, header.nextSibling);

const profileOverlay = document.getElementById('profile-overlay');
const membersOverlay = document.getElementById('members-overlay');
const membersBtn = document.getElementById('members-btn');
const selfProfileBtn = document.getElementById('self-profile-btn');
let currentProfileViewing = null;

// --- VIEW TOGGLER ---
navChatBtn.addEventListener('click', () => {
    chatView.classList.remove('hidden'); chatView.classList.add('flex');
    calendarView.classList.add('hidden'); calendarView.classList.remove('flex');
    
    sidebarListsContainer.classList.remove('hidden');
    sidebarCalendarContainer.classList.add('hidden');
    sidebarCalendarContainer.classList.remove('flex');
    
    navChatBtn.className = 'flex-1 bg-primary text-on-primary py-2 rounded font-bold text-sm shadow-sm transition-all flex justify-center items-center gap-1';
    navCalendarBtn.className = 'flex-1 text-on-primary/70 hover:text-on-primary py-2 rounded font-bold text-sm transition-all flex justify-center items-center gap-1';
});

navCalendarBtn.addEventListener('click', () => {
    calendarView.classList.remove('hidden'); calendarView.classList.add('flex');
    chatView.classList.add('hidden'); chatView.classList.remove('flex');
    
    sidebarListsContainer.classList.add('hidden');
    sidebarCalendarContainer.classList.remove('hidden');
    sidebarCalendarContainer.classList.add('flex');
    
    navCalendarBtn.className = 'flex-1 bg-primary text-on-primary py-2 rounded font-bold text-sm shadow-sm transition-all flex justify-center items-center gap-1';
    navChatBtn.className = 'flex-1 text-on-primary/70 hover:text-on-primary py-2 rounded font-bold text-sm transition-all flex justify-center items-center gap-1';
    
    socket.emit('get events');
});

// --- EXISTING CHAT LOGIC ---
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

socket.on('global presence', (users) => {
    availableUsers = users.filter(u => u !== username);
    updateOnlineStatusUI();
});

socket.on('room directory', (users) => {
    mentionableUsers = users.filter(u => u !== username);
});

function updateOnlineStatusUI() {
    document.querySelectorAll('#dm-list .channel-item').forEach(item => {
        const roomName = item.getAttribute('data-room');
        const dmUser = roomName.replace('DM-', '').split('-').find(u => u !== username);
        const nameSpan = item.querySelector('.dm-name-span');
        if (nameSpan) {
            if (availableUsers.includes(dmUser)) {
                if (!nameSpan.innerHTML.includes('bg-green-500')) nameSpan.innerHTML += ` <span class="inline-block w-2 h-2 bg-green-500 rounded-full ml-1"></span>`;
            } else {
                nameSpan.innerHTML = nameSpan.innerHTML.replace(/<span class="inline-block w-2 h-2 bg-green-500 rounded-full ml-1"><\/span>/g, '');
            }
        }
    });
}

muteBtn.addEventListener('click', () => {
    const icon = muteBtn.querySelector('span');
    if (mutedRooms.has(currentRoom)) {
        mutedRooms.delete(currentRoom); icon.textContent = 'notifications'; muteBtn.classList.remove('text-unread-coral');
    } else {
        mutedRooms.add(currentRoom); icon.textContent = 'notifications_off'; muteBtn.classList.add('text-unread-coral');
    }
});

mentionsHub.addEventListener('click', (e) => {
    const isVisible = mentionsDropdown.style.display === 'flex';
    mentionsDropdown.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) { unreadMentionsCount = 0; mentionsBadge.style.display = 'none'; }
    e.stopPropagation();
});

document.addEventListener('click', () => { mentionsDropdown.style.display = 'none'; searchResults.style.display = 'none'; });

function processMentionAlert(data) {
    if (data.user === username) return;
    unreadMentionsCount++; mentionsBadge.textContent = unreadMentionsCount; mentionsBadge.style.display = 'flex';
    playDing();
    if (Notification.permission === "granted" && document.hidden) new Notification(`Mention from ${data.user}`, { body: data.text });

    const alertDiv = document.createElement('div');
    alertDiv.className = 'p-3 border-b border-border-subtle font-body-sm text-on-surface cursor-pointer hover:bg-surface-container-low transition-colors';
    const displayRoomName = data.room.startsWith('DM-') ? 'Direct Message' : `#${data.room}`;
    alertDiv.innerHTML = `<div class="font-bold text-primary mb-1">${data.user} in ${displayRoomName}</div>${data.text}`;
    alertDiv.addEventListener('click', () => {
        ensureSidebarItemExists(data.room, data.user);
        const targetEl = document.querySelector(`.channel-item[data-room="${data.room}"]`);
        if (targetEl) {
            switchRoom(targetEl);
            if(calendarView.classList.contains('flex')) navChatBtn.click(); // Switch to chat if in calendar
        }
    });
    mentionsDropdown.prepend(alertDiv);
}

socket.on('unread alert', (data) => {
    if (data.room === currentRoom && !calendarView.classList.contains('flex')) return; 
    ensureSidebarItemExists(data.room, data.user);
    const targetEl = document.querySelector(`.channel-item[data-room="${data.room}"]`);
    if (targetEl) {
        let badge = targetEl.querySelector('.unread-badge');
        if (badge) { badge.textContent = parseInt(badge.textContent || 0) + 1; badge.style.display = 'inline-block'; }
    }
    if (data.text && data.text.toLowerCase().includes(`@${username.toLowerCase()}`)) processMentionAlert(data);
    else if (!mutedRooms.has(data.room) && data.user !== username) playDing(); 
});

function addChannelToSidebar(roomName, targetList) {
    if (document.querySelector(`.channel-item[data-room="${roomName}"]`)) return; 
    const li = document.createElement('li');
    li.className = 'channel-item flex items-center justify-between gap-3 text-on-secondary/70 px-3 py-2 hover:bg-surface-container-lowest/10 rounded-lg cursor-pointer border-l-4 border-transparent text-on-primary/70';
    li.setAttribute('data-room', roomName);
    const isDM = roomName.startsWith('DM-');
    const dmUser = isDM ? roomName.replace('DM-', '').split('-').find(u => u !== username) : '';
    const displayName = isDM ? ` <span class="dm-name-span">${dmUser}</span>` : `# ${roomName}`;
    li.innerHTML = `<div class="flex items-center gap-3"><span class="font-label-md text-label-md">${displayName}</span></div> <span class="unread-badge bg-unread-coral text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center" style="display: none;">0</span>`;
    li.addEventListener('click', function() { switchRoom(this); navChatBtn.click(); });
    targetList.appendChild(li);
    if (isDM) updateOnlineStatusUI();
    return li;
}

function ensureSidebarItemExists(room, fromUser) {
    if (!document.querySelector(`.channel-item[data-room="${room}"]`)) {
        if (room.startsWith('DM-')) addChannelToSidebar(room, dmList); else addChannelToSidebar(room, channelList);
    }
}

function joinRoom(newRoom) {
    currentOffset = 0; hasMoreHistory = true; pinnedMessagesMap.clear(); updatePinnedBanner(); messages.innerHTML = '';
    socket.emit('join room', { room: newRoom, username: username }); currentRoom = newRoom;
}

function switchRoom(element) {
    const activeEl = document.querySelector('.channel-item.border-primary');
    if (activeEl) {
        activeEl.classList.remove('bg-primary/20', 'border-primary', 'text-on-primary');
        activeEl.classList.add('text-on-primary/70', 'border-transparent');
    }
    element.classList.remove('text-on-primary/70', 'border-transparent');
    element.classList.add('bg-primary/20', 'border-primary', 'text-on-primary');

    const newRoom = element.getAttribute('data-room');
    const badge = element.querySelector('.unread-badge');
    if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
    
    if (newRoom.startsWith('DM-')) {
        const otherUser = newRoom.replace('DM-', '').split('-').find(u => u !== username);
        headerTitleText.textContent = ` ${otherUser}`;
    } else headerTitleText.textContent = `# ${newRoom}`;
    
    const icon = muteBtn.querySelector('span');
    if (mutedRooms.has(newRoom)) { icon.textContent = 'notifications_off'; muteBtn.classList.add('text-unread-coral'); } 
    else { icon.textContent = 'notifications'; muteBtn.classList.remove('text-unread-coral'); }
    clearReply(); joinRoom(newRoom);
}

messages.addEventListener('scroll', () => {
    if (messages.scrollTop === 0 && !isFetchingHistory && hasMoreHistory) {
        isFetchingHistory = true; currentOffset += 50;
        socket.emit('load more messages', { room: currentRoom, offset: currentOffset });
    }
});

document.querySelectorAll('.channel-item').forEach(item => { item.addEventListener('click', function() { switchRoom(this); }); });

function openDirectMessage(targetUser) {
    const dmRoomId = `DM-${[username, targetUser].sort().join('-')}`;
    ensureSidebarItemExists(dmRoomId, targetUser);
    const targetEl = document.querySelector(`.channel-item[data-room="${dmRoomId}"]`);
    switchRoom(targetEl); navChatBtn.click();
}

let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) { searchResults.style.display = 'none'; return; }
    searchTimeout = setTimeout(() => { socket.emit('search messages', query); }, 300); 
});

searchResults.addEventListener('click', (e) => e.stopPropagation());

socket.on('search results', (results) => {
    searchResults.innerHTML = '';
    if (results.length === 0) searchResults.innerHTML = '<div class="p-4 text-on-surface-variant font-body-sm text-center">No results found.</div>';
    else {
        results.forEach(msg => {
            const resDiv = document.createElement('div');
            resDiv.className = 'p-3 hover:bg-surface-container-low rounded cursor-pointer transition-colors border-b border-border-subtle last:border-0';
            const displayRoom = msg.room.startsWith('DM-') ? 'DM' : `#${msg.room}`;
            resDiv.innerHTML = `
                <div class="flex justify-between items-center mb-1"><span class="font-bold text-on-surface text-sm">${msg.user}</span><span class="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">${displayRoom}</span></div>
                <div class="text-on-surface-variant text-xs line-clamp-2">${msg.text || '[Attachment]'}</div>
            `;
            resDiv.addEventListener('click', () => {
                ensureSidebarItemExists(msg.room, msg.user);
                const targetEl = document.querySelector(`.channel-item[data-room="${msg.room}"]`);
                if (targetEl) switchRoom(targetEl);
                searchResults.style.display = 'none'; searchInput.value = '';
            });
            searchResults.appendChild(resDiv);
        });
    }
    searchResults.style.display = 'flex';
});

createChannelBtn.addEventListener('click', () => {
    userSelectList.innerHTML = ''; 
    mentionableUsers.forEach(u => {
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
    createChannelOverlay.style.display = 'none'; document.getElementById('new-channel-name').value = '';
});

socket.on('new custom channel', (channelName) => { addChannelToSidebar(channelName, channelList); });

input.addEventListener('input', () => {
    savedCursorPos = input.selectionStart; const val = input.value;
    const match = val.substring(0, savedCursorPos).match(/(?:^|\s)@([a-zA-Z0-9_ ]*)$/);
    if (match) {
        const searchTerm = match[1].toLowerCase();
        filteredUsers = mentionableUsers.filter(u => u.toLowerCase().startsWith(searchTerm));
        if (filteredUsers.length > 0) buildMentionDropdown(); else closeMentionDropdown();
    } else closeMentionDropdown();
    
    socket.emit('typing', { room: currentRoom, username: username });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { socket.emit('stop typing', { room: currentRoom, username: username }); }, 1500);
});

socket.on('user typing', (typist) => { typingText.textContent = `${typist} is typing...`; typingIndicator.classList.remove('hidden'); });
socket.on('user stopped typing', () => { typingIndicator.classList.add('hidden'); });

function buildMentionDropdown() {
  mentionDropdown.innerHTML = ''; mentionDropdown.style.display = 'block';
  if (selectedMentionIndex >= filteredUsers.length) selectedMentionIndex = 0;
  filteredUsers.forEach((user, index) => {
    const item = document.createElement('div'); item.className = 'mention-item';
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
    if (index === selectedMentionIndex) { item.classList.add('active'); item.scrollIntoView({ block: 'nearest' }); } else item.classList.remove('active');
  });
}
function closeMentionDropdown() { mentionDropdown.style.display = 'none'; filteredUsers = []; selectedMentionIndex = 0; }

function insertMention(userToTag) {
  const val = input.value; const match = val.substring(0, savedCursorPos).match(/(?:^|\s)@([a-zA-Z0-9_ ]*)$/);
  if (match) {
    const startPos = match.index + (match[0].startsWith(' ') ? 1 : 0);
    input.value = val.substring(0, startPos) + `@${userToTag} ` + val.substring(savedCursorPos);
    input.focus(); input.selectionStart = input.selectionEnd = savedCursorPos = startPos + userToTag.length + 2; 
  }
  closeMentionDropdown();
}

function sendMessage() {
  const textVal = input.value.trim();
  if (mentionDropdown.style.display !== 'block' && (textVal !== '' || attachedFileData !== null)) {
    const payload = { user: username, text: textVal, room: currentRoom };
    if (attachedFileData !== null) payload.file = attachedFileData;
    if (replyingToMessage !== null) payload.replyTo = replyingToMessage;
    
    socket.emit('chat message', payload);
    socket.emit('stop typing', { room: currentRoom, username: username });
    input.value = ''; clearAttachment(); clearReply(); closeMentionDropdown();
  }
}

form.addEventListener('submit', function(e) { e.preventDefault(); sendMessage(); });

input.addEventListener('keydown', (e) => {
  if (mentionDropdown.style.display === 'block') {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedMentionIndex = (selectedMentionIndex + 1) % filteredUsers.length; updateActiveHighlight(); } 
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedMentionIndex = (selectedMentionIndex - 1 + filteredUsers.length) % filteredUsers.length; updateActiveHighlight(); } 
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (filteredUsers[selectedMentionIndex]) insertMention(filteredUsers[selectedMentionIndex]); } 
    else if (e.key === 'Escape') closeMentionDropdown();
  } 
  else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

document.getElementById('attach-btn').addEventListener('click', () => { document.getElementById('file-input').click(); });
window.clearAttachment = function() { attachedFileData = null; document.getElementById('attachment-preview').style.display = 'none'; document.getElementById('file-input').value = ''; };
window.clearReply = function() { replyingToMessage = null; document.getElementById('reply-preview').style.display = 'none'; };

function setReply(data, previewText) {
  replyingToMessage = { id: data.id, user: data.user, text: previewText.length > 50 ? previewText.substring(0, 50) + '...' : previewText };
  document.getElementById('reply-preview').innerHTML = `<button type="button" class="float-right text-error font-bold" onclick="clearReply()">×</button><strong>Replying to ${data.user}</strong><br/><span class="text-on-surface-variant">${replyingToMessage.text}</span>`;
  document.getElementById('reply-preview').style.display = 'block'; input.focus();
}

document.getElementById('file-input').addEventListener('change', function() {
  const file = this.files[0]; if (!file) return;
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
  const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
  oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); 
  oscillator.connect(gainNode); gainNode.connect(audioCtx.destination); oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.15); 
}

function updatePinnedBanner() {
    pinnedBanner.innerHTML = '';
    if (pinnedMessagesMap.size === 0) { pinnedBanner.classList.add('hidden'); return; }
    pinnedBanner.classList.remove('hidden'); pinnedBanner.classList.add('flex');
    pinnedMessagesMap.forEach((msgData, id) => {
        const pinRow = document.createElement('div');
        pinRow.className = 'flex items-center justify-between p-2 bg-surface-container-low rounded hover:bg-white cursor-pointer border border-border-subtle transition-colors';
        pinRow.innerHTML = `<div class="flex items-center gap-2 text-primary font-body-sm line-clamp-1"><span class="material-symbols-outlined text-[14px]">keep</span> <strong>${msgData.user}:</strong> <span class="text-on-surface-variant">${msgData.text || 'Attachment'}</span></div>`;
        pinRow.addEventListener('click', () => {
            const el = document.getElementById(`msg-${id}`);
            if(el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ring-2', 'ring-primary'); setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 1500); }
        });
        pinnedBanner.appendChild(pinRow);
    });
}

function createHoverAction(icon, tooltipText, onClick, isDanger = false) {
    const wrapper = document.createElement('div'); wrapper.className = 'relative group/action';
    const btn = document.createElement('button');
    btn.className = `p-1.5 hover:bg-surface-container-low rounded-md text-on-surface-variant transition-colors ${isDanger ? 'hover:text-error' : 'hover:text-primary'}`;
    btn.innerHTML = `<span class="material-symbols-outlined text-[16px]">${icon}</span>`;
    btn.addEventListener('click', onClick);
    const tooltip = document.createElement('div');
    tooltip.className = 'absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-sidebar-bg text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover/action:opacity-100 pointer-events-none whitespace-nowrap z-20';
    tooltip.textContent = tooltipText;
    wrapper.appendChild(btn); wrapper.appendChild(tooltip); return wrapper;
}

function displayMessage(data, isHistory = false, prepend = false) {
  const container = document.createElement('li'); const isMe = (data.user === username);
  container.className = isMe ? 'flex items-end justify-end gap-3 max-w-[85%] ml-auto group' : 'flex items-end gap-3 max-w-[85%] group';
  const messageId = data.id || Math.random().toString(36).substr(2, 9); container.id = `msg-${messageId}`;
  if (data.is_pinned && isHistory) pinnedMessagesMap.set(messageId, data);

  const contentCol = document.createElement('div'); contentCol.className = isMe ? 'flex flex-col gap-1 items-end' : 'flex flex-col gap-1';
  const nameRow = document.createElement('div'); nameRow.className = isMe ? 'flex items-center gap-2 mr-1' : 'flex items-center gap-2 ml-1';
  const senderName = document.createElement('span');
  senderName.className = 'font-label-md text-label-md text-on-surface cursor-pointer hover:underline';
  senderName.textContent = isMe ? 'You' : data.user;
  senderName.addEventListener('click', () => fetchAndShowProfile(isMe ? username : data.user));

  const bubble = document.createElement('div');
  bubble.className = isMe ? 'bg-outgoing-blue text-on-surface p-3 md:p-4 rounded-bubble-outgoing border border-primary/10 relative shadow-sm' : 'bg-surface-container-lowest text-on-surface p-3 md:p-4 rounded-bubble-incoming shadow-ambient border border-border-subtle/50 relative';
  
  if (data.is_deleted) {
      bubble.innerHTML = '<p class="text-on-surface-variant italic font-body-sm flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">block</span> This message was deleted</p>';
      nameRow.appendChild(senderName); contentCol.appendChild(nameRow); contentCol.appendChild(bubble);
  } else {
      if (data.replyTo) {
          const quoteDiv = document.createElement('div'); quoteDiv.className = 'bg-white/60 border-l-2 border-primary pl-3 pr-2 py-2 mb-2 rounded-r-md text-sm cursor-pointer hover:bg-white/80 transition-colors';
          quoteDiv.addEventListener('click', () => {
              const originalMsg = document.getElementById(`msg-${data.replyTo.id}`);
              if (originalMsg) { originalMsg.scrollIntoView({ behavior: 'smooth', block: 'center' }); originalMsg.classList.add('ring-2', 'ring-primary', 'transition-all'); setTimeout(() => originalMsg.classList.remove('ring-2', 'ring-primary'), 1500); }
          });
          quoteDiv.innerHTML = `<p class="font-label-sm text-primary mb-1">${data.replyTo.user}</p><p class="font-body-sm text-on-surface-variant line-clamp-1">${data.replyTo.text}</p>`;
          bubble.appendChild(quoteDiv);
      }
      if (data.text) {
          const textDiv = document.createElement('p'); textDiv.className = 'font-body-md text-body-md whitespace-pre-wrap'; 
          if (data.text.toLowerCase().includes(`@${username.toLowerCase()}`)) { bubble.classList.add('ring-2', 'ring-mention-gold'); if (!isMe && !isHistory) processMentionAlert(data); } else if (!isMe && !mutedRooms.has(currentRoom) && !isHistory) playDing(); 
          textDiv.textContent = data.text; bubble.appendChild(textDiv);
      } else if (!isMe && !mutedRooms.has(currentRoom) && !isHistory) playDing(); 
      if (data.file) {
          if (data.file.type.startsWith('image/')) {
              const img = document.createElement('img'); img.src = data.file.data; img.className = 'max-w-[250px] rounded-lg mt-2 cursor-pointer border border-border-subtle';
              img.addEventListener('click', () => window.open(data.file.data, '_blank')); bubble.appendChild(img);
          } else {
              const link = document.createElement('div'); link.className = 'bg-surface-container-low border border-border-subtle rounded-lg p-3 flex items-center gap-4 cursor-pointer hover:bg-surface-container transition-colors mt-2';
              link.innerHTML = `<div class="w-10 h-10 bg-primary/10 rounded flex items-center justify-center text-primary"><span class="material-symbols-outlined fill">insert_drive_file</span></div><div class="flex-1"><h4 class="font-label-md text-label-md text-on-surface">${data.file.name}</h4></div><a href="${data.file.data}" download="${data.file.name}" class="text-on-surface-variant hover:text-primary"><span class="material-symbols-outlined">download</span></a>`;
              bubble.appendChild(link);
          }
      }

      const hoverActions = document.createElement('div'); hoverActions.className = `action-menu flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-surface/50 rounded-md px-1`;
      hoverActions.appendChild(createHoverAction('reply', 'Reply', () => setReply(data, data.text ? data.text : (data.file ? `[Attachment: ${data.file.name}]` : 'Message'))));
      const pinText = data.is_pinned ? 'Unpin message' : 'Pin message';
      hoverActions.appendChild(createHoverAction('keep', pinText, () => socket.emit('toggle pin', { room: currentRoom, msgId: messageId, msgData: data })));
      hoverActions.appendChild(createHoverAction('visibility_off', 'Delete for me', () => socket.emit('delete for me', { room: currentRoom, msgId: messageId })));
      if (isMe) hoverActions.appendChild(createHoverAction('delete', 'Delete for everyone', () => socket.emit('delete message', { room: currentRoom, msgId: messageId }), true));

      if (isMe) { nameRow.appendChild(hoverActions); nameRow.appendChild(senderName); } else { nameRow.appendChild(senderName); nameRow.appendChild(hoverActions); }
      contentCol.appendChild(nameRow); contentCol.appendChild(bubble);
      
      const reactionBar = document.createElement('div'); reactionBar.className = 'flex gap-1 mt-1 min-h-[24px]';
      const emojis = ['👍', '👎', '❤️', '✅', '👀'];
      emojis.forEach(emoji => {
        const btn = document.createElement('button'); btn.className = 'relative bg-surface-container-lowest border border-border-subtle rounded-full px-2 py-0.5 text-xs cursor-pointer hover:bg-surface-container-low hidden group/react'; btn.id = `btn-${messageId}-${emoji}`; 
        const usersArray = data.reactions && data.reactions[emoji] ? data.reactions[emoji] : []; const count = usersArray.length;
        const tooltip = document.createElement('div'); tooltip.className = 'absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-sidebar-bg text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover/react:opacity-100 pointer-events-none whitespace-nowrap z-20'; tooltip.id = `tooltip-${messageId}-${emoji}`;
        if (count > 0) { btn.classList.remove('hidden'); btn.classList.add('flex', 'items-center', 'gap-1'); if (usersArray.includes(username)) btn.classList.add('bg-primary/10', 'border-primary/30'); tooltip.innerHTML = usersArray.join(', '); } else tooltip.innerHTML = `React with ${emoji}`;
        btn.innerHTML = `${emoji} <span class="font-bold text-on-surface-variant" id="count-${messageId}-${emoji}">${count > 0 ? count : ''}</span>`;
        btn.appendChild(tooltip); btn.addEventListener('click', () => socket.emit('add reaction', { roomId: currentRoom, msgId: messageId, emoji: emoji, username: username }));
        container.addEventListener('mouseenter', () => btn.classList.remove('hidden')); container.addEventListener('mouseleave', () => { if (parseInt(document.getElementById(`count-${messageId}-${emoji}`).textContent || 0) === 0) btn.classList.add('hidden'); }); reactionBar.appendChild(btn);
      });
      contentCol.appendChild(reactionBar);
  }
  if (!isMe) {
      const avatarDiv = document.createElement('div'); avatarDiv.className = 'w-8 h-8 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center text-primary font-bold mb-6'; avatarDiv.textContent = data.user.charAt(0).toUpperCase(); container.appendChild(avatarDiv);
  }
  container.appendChild(contentCol);
  if (prepend) messages.prepend(container); else { messages.appendChild(container); messages.scrollTop = messages.scrollHeight; }
}

socket.on('message deleted', (msgId) => {
    const msgEl = document.getElementById(`msg-${msgId}`);
    if (msgEl) {
        const bubble = msgEl.querySelector('.rounded-bubble-outgoing') || msgEl.querySelector('.rounded-bubble-incoming');
        if (bubble) bubble.innerHTML = '<p class="text-on-surface-variant italic font-body-sm flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">block</span> This message was deleted</p>';
        const hoverActions = msgEl.querySelector('.action-menu'); if (hoverActions) hoverActions.remove();
        const reactionBar = msgEl.querySelector('.min-h-\\[24px\\]'); if (reactionBar) reactionBar.remove();
    }
});
socket.on('message deleted for me', (msgId) => {
    const msgEl = document.getElementById(`msg-${msgId}`); if (msgEl) msgEl.remove();
    if (pinnedMessagesMap.has(msgId)) { pinnedMessagesMap.delete(msgId); updatePinnedBanner(); }
});
socket.on('update pin', (data) => {
    if (data.isPinned) pinnedMessagesMap.set(data.msgId, data.msgData); else pinnedMessagesMap.delete(data.msgId);
    updatePinnedBanner();
    const msgEl = document.getElementById(`msg-${data.msgId}`);
    if (msgEl) { const pinIcons = msgEl.querySelectorAll('.material-symbols-outlined'); pinIcons.forEach(icon => { if (icon.textContent === 'keep') { const tooltip = icon.parentElement.nextElementSibling; if (tooltip) tooltip.textContent = data.isPinned ? 'Unpin message' : 'Pin message'; } }); }
});
socket.on('chat message', function(data) { displayMessage(data, false, false); });
socket.on('chat history', function(historyArray) { if (historyArray.length < 50) hasMoreHistory = false; historyArray.forEach(messageData => displayMessage(messageData, true, false)); updatePinnedBanner(); });
socket.on('older messages', function(historyArray) { if (historyArray.length < 50) hasMoreHistory = false; const previousScrollHeight = messages.scrollHeight; historyArray.reverse().forEach(messageData => displayMessage(messageData, true, true)); messages.scrollTop = messages.scrollHeight - previousScrollHeight; isFetchingHistory = false; });
socket.on('update reaction', function(data) {
  const btn = document.getElementById(`btn-${data.msgId}-${data.emoji}`); const countSpan = document.getElementById(`count-${data.msgId}-${data.emoji}`); const tooltip = document.getElementById(`tooltip-${data.msgId}-${data.emoji}`);
  if (btn && countSpan && tooltip) {
    const count = data.users.length; countSpan.textContent = count > 0 ? count : '';
    if (count > 0) { btn.classList.remove('hidden'); btn.classList.add('flex', 'items-center', 'gap-1'); if (data.users.includes(username)) btn.classList.add('bg-primary/10', 'border-primary/30'); else btn.classList.remove('bg-primary/10', 'border-primary/30'); tooltip.innerHTML = data.users.join(', '); } 
    else { btn.classList.remove('flex', 'items-center', 'gap-1', 'bg-primary/10', 'border-primary/30'); btn.classList.add('hidden'); tooltip.innerHTML = `React with ${data.emoji}`; }
  }
});
input.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; if (this.value === '') this.style.height = 'auto'; });

function fetchAndShowProfile(targetUsername) { currentProfileViewing = targetUsername; socket.emit('get profile', targetUsername); }
socket.on('profile data', (data) => {
    document.getElementById('profile-avatar').textContent = data.username.charAt(0).toUpperCase(); document.getElementById('profile-name').textContent = data.username; document.getElementById('profile-role').textContent = data.role === 'user' ? 'Standard User' : data.role;
    document.getElementById('profile-email').textContent = data.email || 'Not set'; document.getElementById('profile-contact').textContent = data.contact || 'Not set'; document.getElementById('profile-status-msg').textContent = data.status_msg || 'Available';
    const isOnline = availableUsers.includes(data.username) || data.username === username;
    const statusContainer = document.getElementById('profile-online-status'); const statusDot = document.getElementById('profile-status-dot'); const statusText = document.getElementById('profile-status-text');
    if (isOnline) { statusContainer.className = "mt-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 bg-green-100 text-green-700"; statusDot.className = "w-2 h-2 rounded-full bg-green-500"; statusText.textContent = "Online"; } 
    else { statusContainer.className = "mt-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 bg-gray-100 text-gray-600"; statusDot.className = "w-2 h-2 rounded-full bg-gray-400"; statusText.textContent = "Offline"; }
    const actionsContainer = document.getElementById('profile-actions'); actionsContainer.innerHTML = ''; 
    if (data.username === username) actionsContainer.innerHTML = `<button class="w-full bg-surface-container-high text-on-surface py-2 rounded-lg hover:bg-border-subtle transition-colors flex items-center justify-center gap-2 font-bold text-sm"><span class="material-symbols-outlined text-[18px]">settings</span> Settings</button>`;
    else actionsContainer.innerHTML = `<button onclick="messageFromProfile('${data.username}')" class="w-full bg-primary-container text-on-primary py-2 rounded-lg hover:bg-primary transition-colors flex items-center justify-center gap-2 font-bold text-sm shadow-sm"><span class="material-symbols-outlined text-[18px]">chat</span> Message</button>`;
    profileOverlay.style.display = 'flex';
});
window.messageFromProfile = function(targetUser) { profileOverlay.style.display = 'none'; openDirectMessage(targetUser); };

membersBtn.addEventListener('click', () => {
    const listContainer = document.getElementById('members-list-container'); listContainer.innerHTML = '';
    const allMembers = [username, ...mentionableUsers].sort((a, b) => { if (a === username) return -1; if (b === username) return 1; return a.localeCompare(b); });
    document.getElementById('members-count').textContent = `${allMembers.length} users`;
    allMembers.forEach(member => {
        const isOnline = availableUsers.includes(member) || member === username;
        const div = document.createElement('div'); div.className = "flex items-center justify-between p-2 hover:bg-surface-container-low rounded-lg cursor-pointer transition-colors";
        div.innerHTML = `<div class="flex items-center gap-3"><div class="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-xs relative">${member.charAt(0).toUpperCase()}<span class="absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-surface rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}"></span></div><span class="font-body-sm font-bold text-on-surface">${member === username ? member + ' (You)' : member}</span></div>`;
        div.addEventListener('click', () => { membersOverlay.style.display = 'none'; fetchAndShowProfile(member); }); listContainer.appendChild(div);
    });
    membersOverlay.style.display = 'flex';
});
if (selfProfileBtn) selfProfileBtn.addEventListener('click', () => { fetchAndShowProfile(username); });


// ==========================================
// CALENDAR ENGINE LOGIC
// ==========================================

let currentDate = new Date();
let currentEvents = [];

const gridContainer = document.getElementById('calendar-grid');
const monthLabel = document.getElementById('calendar-month-label');

document.getElementById('cal-prev-btn').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
document.getElementById('cal-next-btn').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
document.getElementById('cal-today-btn').addEventListener('click', () => { currentDate = new Date(); renderCalendar(); });

function renderCalendar() {
    gridContainer.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthLabel.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Padding blanks for the start of the month
    for (let i = 0; i < firstDay; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'bg-surface p-2 min-h-[100px] bg-surface-container-low/50';
        gridContainer.appendChild(emptyDiv);
    }

    // Actual days
    for (let i = 1; i <= daysInMonth; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'bg-surface p-2 min-h-[100px] hover:bg-surface-container-low transition-colors group relative border-t-2 border-transparent';
        
        const isToday = new Date().getDate() === i && new Date().getMonth() === month && new Date().getFullYear() === year;
        
        let headerHtml = '';
        if (isToday) {
            dayDiv.classList.add('bg-mention-gold/10');
            headerHtml = `<span class="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-sm mb-1 shadow-sm mx-auto md:mx-0">${i}</span>`;
        } else {
            headerHtml = `<span class="font-label-sm text-on-surface">${i}</span>`;
        }
        
        dayDiv.innerHTML = `${headerHtml}<div class="flex flex-col gap-1 mt-1 events-container" id="day-${year}-${month}-${i}"></div>`;
        gridContainer.appendChild(dayDiv);
    }
    
    // Plot events
    plotEvents();
    updateUpcomingEvents();
}

function plotEvents() {
    // Clear all existing pills
    document.querySelectorAll('.events-container').forEach(el => el.innerHTML = '');
    
    currentEvents.forEach(evt => {
        const startDate = new Date(evt.start_time);
        const y = startDate.getFullYear();
        const m = startDate.getMonth();
        const d = startDate.getDate();
        
        const targetContainer = document.getElementById(`day-${y}-${m}-${d}`);
        if (targetContainer) {
            const myRsvpStatus = JSON.parse(evt.attendees).find(a => a.username === username)?.status || 'pending';
            const isOrg = evt.organizer === username;
            
            let colorClass = 'bg-surface-container-high text-on-surface-variant border border-border-subtle border-dashed'; // Pending default
            if (isOrg || myRsvpStatus === 'accepted') colorClass = 'bg-primary-container text-on-primary shadow-sm';
            
            const timeString = startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            const pill = document.createElement('div');
            pill.className = `${colorClass} rounded px-2 py-1 text-xs truncate flex items-center gap-1 hover:opacity-90 transition-opacity cursor-pointer`;
            pill.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${isOrg || myRsvpStatus === 'accepted' ? 'bg-primary' : 'bg-outline'} flex-shrink-0"></span> ${timeString} - ${evt.title}`;
            
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                openEventDetails(evt);
            });
            targetContainer.appendChild(pill);
        }
    });
}

// Data Handling
socket.on('events data', (events) => {
    currentEvents = events;
    renderCalendar();
});

socket.on('event refresh', () => {
    if (calendarView.classList.contains('flex')) socket.emit('get events');
});

// Create Modal Logic
document.getElementById('open-new-meeting-btn').addEventListener('click', () => {
    document.getElementById('event-title').value = '';
    document.getElementById('event-start').value = '';
    document.getElementById('event-end').value = '';
    document.getElementById('event-desc').value = '';
    
    const attList = document.getElementById('event-attendees-list');
    attList.innerHTML = '';
    mentionableUsers.forEach(u => {
        attList.innerHTML += `<label class="flex items-center gap-2 mb-1 text-sm cursor-pointer hover:bg-white p-1 rounded"><input type="checkbox" value="${u}"> ${u}</label>`;
    });
    
    document.getElementById('newMeetingModal').classList.remove('hidden');
});

document.getElementById('create-event-submit-btn').addEventListener('click', () => {
    const title = document.getElementById('event-title').value.trim();
    const startTime = document.getElementById('event-start').value;
    const endTime = document.getElementById('event-end').value;
    const desc = document.getElementById('event-desc').value.trim();
    const attendees = Array.from(document.getElementById('event-attendees-list').querySelectorAll('input:checked')).map(cb => cb.value);
    
    if(!title || !startTime) return alert('Title and Start Time are required.');
    
    socket.emit('create event', { title, startTime, endTime, description: desc, attendees });
    document.getElementById('newMeetingModal').classList.add('hidden');
});

// View Modal Logic
function openEventDetails(evt) {
    document.getElementById('view-event-title').textContent = evt.title;
    
    const start = new Date(evt.start_time);
    const end = evt.end_time ? new Date(evt.end_time) : null;
    
    document.getElementById('view-event-date').textContent = start.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('view-event-time').textContent = start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + (end ? ` - ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : '');
    
    document.getElementById('view-event-org-initial').textContent = evt.organizer.charAt(0).toUpperCase();
    document.getElementById('view-event-org-name').textContent = evt.organizer === username ? `${evt.organizer} (You)` : evt.organizer;
    
    document.getElementById('view-event-desc').textContent = evt.description || "No description provided.";
    
    const attendeesList = document.getElementById('view-event-attendees');
    attendeesList.innerHTML = '';
    
    const attendeesArray = JSON.parse(evt.attendees);
    document.getElementById('view-event-attendee-count').textContent = `Attendees (${attendeesArray.length})`;
    
    let myRsvp = null;
    
    attendeesArray.forEach(att => {
        if(att.username === username) myRsvp = att.status;
        let statusIcon = '';
        if(att.status === 'accepted') statusIcon = '<span class="material-symbols-outlined text-green-600 text-[14px]">check_circle</span>';
        else if(att.status === 'declined') statusIcon = '<span class="material-symbols-outlined text-error text-[14px]">cancel</span>';
        else statusIcon = '<span class="material-symbols-outlined text-on-surface-variant text-[14px]">help</span>';

        attendeesList.innerHTML += `
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center text-xs text-on-surface-variant">${att.username.charAt(0).toUpperCase()}</div>
                    <span class="font-body-sm text-on-surface ${att.status === 'declined' ? 'line-through opacity-60' : ''}">${att.username}</span>
                </div>
                ${statusIcon}
            </div>
        `;
    });

    const actionsContainer = document.getElementById('view-event-actions');
    actionsContainer.innerHTML = '';
    
    if(evt.organizer === username) {
        // Organizer controls
        actionsContainer.innerHTML = `
            <button onclick="deleteEvent('${evt.id}')" class="text-error font-label-md text-label-md hover:bg-error-container/30 px-3 py-1.5 rounded transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">delete</span> Cancel Meeting</button>
            <div></div> `;
    } else {
        // Attendee controls
        actionsContainer.innerHTML = `<div></div>`; // Spacer
        const btns = document.createElement('div');
        btns.className = "flex gap-2";
        
        btns.innerHTML = `
            <button onclick="rsvpEvent('${evt.id}', 'declined')" class="p-2 border border-border-subtle rounded ${myRsvp === 'declined' ? 'bg-error text-white' : 'bg-surface hover:bg-surface-container text-on-surface'} transition-colors" title="Decline"><span class="material-symbols-outlined text-[18px]">close</span></button>
            <button onclick="rsvpEvent('${evt.id}', 'accepted')" class="px-4 py-1.5 font-label-md text-label-md rounded shadow-sm transition-colors flex items-center gap-1 ${myRsvp === 'accepted' ? 'bg-green-600 text-white' : 'bg-primary text-on-primary hover:bg-primary/90'}"><span class="material-symbols-outlined text-[18px]">check</span> Accept</button>
        `;
        actionsContainer.appendChild(btns);
    }
    
    document.getElementById('eventDetailsModal').classList.remove('hidden');
}

window.rsvpEvent = function(eventId, status) {
    socket.emit('rsvp event', { eventId, status });
    document.getElementById('eventDetailsModal').classList.add('hidden');
};

window.deleteEvent = function(eventId) {
    if(confirm("Are you sure you want to cancel this meeting for everyone?")) {
        socket.emit('cancel event', eventId);
        document.getElementById('eventDetailsModal').classList.add('hidden');
    }
};
function updateUpcomingEvents() {
    const list = document.getElementById('upcoming-events-list');
    if(!list) return;
    list.innerHTML = '';
    
    const today = new Date();
    const todayEvents = currentEvents.filter(evt => {
        const evtDate = new Date(evt.start_time);
        return evtDate.getDate() === today.getDate() && 
               evtDate.getMonth() === today.getMonth() && 
               evtDate.getFullYear() === today.getFullYear();
    }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    if (todayEvents.length === 0) {
        list.innerHTML = '<p class="px-2 italic opacity-70 text-sm">No events today.</p>';
        return;
    }

    todayEvents.forEach(evt => {
        const timeString = new Date(evt.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const div = document.createElement('div');
        div.className = "bg-primary/20 p-3 rounded-lg border border-primary/30 cursor-pointer hover:bg-primary/30 transition-colors shadow-sm";
        div.innerHTML = `<div class="font-bold text-on-primary text-sm truncate">${evt.title}</div><div class="text-xs text-on-primary/80 flex items-center gap-1 mt-1"><span class="material-symbols-outlined text-[14px]">schedule</span> ${timeString}</div>`;
        div.addEventListener('click', () => openEventDetails(evt));
        list.appendChild(div);
    });
}