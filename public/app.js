const socket = io();
let username = "Anonymous";
let userRole = "user"; 
let currentRoom = "General";

let availableUsers = []; 
let mentionableUsers = []; 
let allSystemUsers = []; 
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

const chatView = document.getElementById('chat-view');
const calendarView = document.getElementById('calendar-view');
const navChatBtn = document.getElementById('nav-chat-btn');
const navCalendarBtn = document.getElementById('nav-calendar-btn');
const sidebarListsContainer = document.getElementById('sidebar-lists-container');
const sidebarCalendarContainer = document.getElementById('sidebar-calendar-container');

const loginOverlay = document.getElementById('login-overlay');
const usernameInput = document.getElementById('username-input');
const roleInput = document.getElementById('role-input');
const joinBtn = document.getElementById('join-btn');
const channelList = document.getElementById('channel-list');
const dmList = document.getElementById('dm-list');

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
const membersBtn = document.getElementById('members-btn');
const selfProfileBtn = document.getElementById('self-profile-btn');
let currentProfileViewing = null;

let viewingOtherUser = null;
let otherUserEvents = [];
let openedProfileFromMembers = false;

// --- REUSABLE SEARCH & CHIP MANAGER ---
class UserSearchManager {
    constructor(inputId, dropdownId, containerId, onChangeCallback = null) {
        this.input = document.getElementById(inputId);
        this.dropdown = document.getElementById(dropdownId);
        this.container = document.getElementById(containerId);
        this.selected = [];
        this.onChangeCallback = onChangeCallback;

        if(!this.input) return;

        this.input.addEventListener('input', () => {
            const val = this.input.value.toLowerCase();
            this.dropdown.innerHTML = '';
            if (!val) { this.dropdown.classList.add('hidden'); return; }

            const matches = allSystemUsers.filter(u => 
                u !== username && 
                u.toLowerCase().includes(val) && 
                !this.selected.includes(u)
            );

            if (matches.length > 0) {
                matches.forEach(u => {
                    const div = document.createElement('div');
                    div.className = 'p-2 hover:bg-surface-container-low cursor-pointer text-sm font-label-md text-on-surface';
                    div.textContent = u;
                    div.addEventListener('click', () => {
                        this.selected.push(u);
                        this.input.value = '';
                        this.dropdown.classList.add('hidden');
                        this.renderChips();
                        if(this.onChangeCallback) this.onChangeCallback();
                    });
                    this.dropdown.appendChild(div);
                });
                this.dropdown.classList.remove('hidden');
            } else {
                this.dropdown.classList.add('hidden');
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
                this.dropdown.classList.add('hidden');
            }
        });
    }

    renderChips() {
        this.container.innerHTML = '';
        this.selected.forEach(u => {
            const pill = document.createElement('div');
            pill.className = 'bg-surface-container-high border border-outline-variant rounded-full px-3 py-1 flex items-center gap-1 text-sm font-label-md text-on-surface';
            pill.innerHTML = `${u} <span class="material-symbols-outlined text-[14px] cursor-pointer hover:text-error" title="Deselect User">close</span>`;
            pill.querySelector('span').addEventListener('click', () => {
                this.selected = this.selected.filter(x => x !== u);
                this.renderChips();
                if(this.onChangeCallback) this.onChangeCallback();
            });
            this.container.appendChild(pill);
        });
    }

    clear() {
        this.selected = [];
        this.input.value = '';
        this.dropdown.classList.add('hidden');
        this.renderChips();
    }
}

// Instantiate search managers
const meetingSearch = new UserSearchManager('attendee-search-input', 'attendee-search-dropdown', 'selected-attendees-container', () => { if(isAssistantOpen) updateAssistantGrid(); });
const msgSearch = new UserSearchManager('msg-search-input', 'msg-search-dropdown', 'msg-selected-container');
const channelSearch = new UserSearchManager('channel-search-input', 'channel-search-dropdown', 'channel-selected-container');
const memberSearch = new UserSearchManager('member-search-input', 'member-search-dropdown', 'member-selected-container');


navChatBtn.addEventListener('click', () => {
    chatView.classList.remove('hidden'); chatView.classList.add('flex');
    calendarView.classList.add('hidden'); calendarView.classList.remove('flex');
    sidebarListsContainer.classList.remove('hidden'); sidebarCalendarContainer.classList.add('hidden'); sidebarCalendarContainer.classList.remove('flex');
    navChatBtn.className = 'flex-1 bg-primary text-on-primary py-2 rounded font-bold text-sm shadow-sm transition-all flex justify-center items-center gap-1';
    navCalendarBtn.className = 'flex-1 text-on-primary/70 hover:text-on-primary py-2 rounded font-bold text-sm transition-all flex justify-center items-center gap-1';
});

navCalendarBtn.addEventListener('click', () => {
    calendarView.classList.remove('hidden'); calendarView.classList.add('flex');
    chatView.classList.add('hidden'); chatView.classList.remove('flex');
    sidebarListsContainer.classList.add('hidden'); sidebarCalendarContainer.classList.remove('hidden'); sidebarCalendarContainer.classList.add('flex');
    navCalendarBtn.className = 'flex-1 bg-primary text-on-primary py-2 rounded font-bold text-sm shadow-sm transition-all flex justify-center items-center gap-1';
    navChatBtn.className = 'flex-1 text-on-primary/70 hover:text-on-primary py-2 rounded font-bold text-sm transition-all flex justify-center items-center gap-1';
    socket.emit('get events');
});

joinBtn.addEventListener('click', () => {
  const enteredName = usernameInput.value.trim();
  if (enteredName !== "") {
    username = enteredName; 
    userRole = roleInput.value; 
    
    const createChanBtn = document.getElementById('create-channel-btn');
    if (userRole === 'admin' || userRole === 'central') {
        createChanBtn.classList.remove('hidden');
        createChanBtn.classList.add('block');
    } else {
        createChanBtn.classList.add('hidden');
        createChanBtn.classList.remove('block');
    }

    loginOverlay.style.display = 'none'; 
    if (Notification.permission !== "granted" && Notification.permission !== "denied") Notification.requestPermission();
    socket.emit('login', { username: username, role: userRole });
    socket.emit('get all users');
    joinRoom(currentRoom);
  }
});

socket.on('all users list', (users) => { allSystemUsers = users; });

socket.on('login success', (data) => {
    data.customChannels.forEach(ch => addChannelToSidebar(ch, channelList));
    if (data.dmRooms) {
        data.dmRooms.forEach(dmRoom => {
            const otherUser = dmRoom.replace('DM-', '').split('-').find(u => u !== username);
            ensureSidebarItemExists(dmRoom, otherUser);
        });
    }
});

socket.on('global presence', (users) => { availableUsers = users.filter(u => u !== username); updateOnlineStatusUI(); });
socket.on('room directory', (users) => { mentionableUsers = users.filter(u => u !== username); });

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
    if (mutedRooms.has(currentRoom)) { mutedRooms.delete(currentRoom); icon.textContent = 'notifications'; muteBtn.classList.remove('text-unread-coral'); } 
    else { mutedRooms.add(currentRoom); icon.textContent = 'notifications_off'; muteBtn.classList.add('text-unread-coral'); }
});

mentionsHub.addEventListener('click', (e) => {
    const isVisible = mentionsDropdown.style.display === 'flex';
    mentionsDropdown.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) { unreadMentionsCount = 0; mentionsBadge.style.display = 'none'; }
    e.stopPropagation();
});

// FIX: Added missing event listener back to the top-right profile button
selfProfileBtn.addEventListener('click', () => {
    openedProfileFromMembers = false;
    fetchAndShowProfile(username);
});

document.addEventListener('click', () => { mentionsDropdown.style.display = 'none'; searchResults.style.display = 'none'; });

function processMentionAlert(data) {
    if (data.user === username) return;
    unreadMentionsCount++; mentionsBadge.textContent = unreadMentionsCount; mentionsBadge.style.display = 'flex';
    playDing();
    if (Notification.permission === "granted" && document.hidden) new Notification(`Mention from ${data.user}`, { body: data.text });

    const alertDiv = document.createElement('div');
    alertDiv.className = 'p-3 border-b border-border-subtle font-body-sm text-on-surface cursor-pointer hover:bg-surface-container-low transition-colors';
    
    if(data.room === 'Calendar') {
        alertDiv.innerHTML = `<div class="font-bold text-primary mb-1"><span class="material-symbols-outlined text-[14px] align-middle">calendar_today</span> Calendar Update</div>${data.text}`;
        alertDiv.addEventListener('click', () => { navCalendarBtn.click(); });
    } else {
        const displayRoomName = data.room.startsWith('DM-') ? 'Direct Message' : `# ${data.room}`;
        alertDiv.innerHTML = `<div class="font-bold text-primary mb-1">${data.user} in ${displayRoomName}</div>${data.text}`;
        alertDiv.addEventListener('click', () => {
            ensureSidebarItemExists(data.room, data.user);
            const targetEl = document.querySelector(`.channel-item[data-room="${data.room}"]`);
            if (targetEl) { switchRoom(targetEl); if(calendarView.classList.contains('flex')) navChatBtn.click(); }
        });
    }
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

socket.on('new meeting invite', (data) => {
    playDing(); socket.emit('get events');
    processMentionAlert({ user: 'System', text: `<strong>${data.organizer}</strong> invited you to "${data.title}"`, room: 'Calendar' });
});

socket.on('meeting cancelled', (data) => {
    playDing(); socket.emit('get events');
    processMentionAlert({ user: 'System', text: `<strong>${data.organizer}</strong> cancelled "${data.title}"`, room: 'Calendar' });
});

socket.on('rsvp notification', (data) => {
    if(calendarView.classList.contains('flex')) socket.emit('get events');
    processMentionAlert({ user: 'System', text: `<strong>${data.attendee}</strong> ${data.status} your invite for "${data.title}"`, room: 'Calendar' });
});

function addChannelToSidebar(roomName, targetList) {
    if (document.querySelector(`.channel-item[data-room="${roomName}"]`)) return document.querySelector(`.channel-item[data-room="${roomName}"]`); 
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
    
    const renameBtn = document.getElementById('rename-room-btn');
    if (newRoom === 'General' || newRoom.startsWith('DM-')) {
        renameBtn.classList.add('hidden');
        renameBtn.classList.remove('flex');
    } else if (newRoom.startsWith('Group-')) {
        renameBtn.classList.remove('hidden');
        renameBtn.classList.add('flex');
    } else {
        if (userRole === 'admin' || userRole === 'central') {
            renameBtn.classList.remove('hidden');
            renameBtn.classList.add('flex');
        } else {
            renameBtn.classList.add('hidden');
            renameBtn.classList.remove('flex');
        }
    }

    clearReply(); joinRoom(newRoom);
}

messages.addEventListener('scroll', () => {
    if (messages.scrollTop === 0 && !isFetchingHistory && hasMoreHistory) {
        isFetchingHistory = true; currentOffset += 50;
        socket.emit('load more messages', { room: currentRoom, offset: currentOffset });
    }
});

document.querySelectorAll('.channel-item').forEach(item => { item.addEventListener('click', function() { switchRoom(this); }); });

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

// --- RENAME ROOM LOGIC ---
document.getElementById('rename-room-btn').addEventListener('click', () => {
    let defaultName = currentRoom;
    if(currentRoom.startsWith('Group-')) defaultName = currentRoom.replace('Group-', '');
    document.getElementById('rename-room-input').value = defaultName;
    document.getElementById('renameRoomModal').classList.remove('hidden');
});

document.getElementById('submit-rename-btn').addEventListener('click', () => {
    let newName = document.getElementById('rename-room-input').value.trim().replace(/\s+/g, '-');
    if (!newName) return;
    
    if (currentRoom.startsWith('Group-') && !newName.startsWith('Group-')) {
        newName = 'Group-' + newName;
    }
    
    if (newName === currentRoom) {
        document.getElementById('renameRoomModal').classList.add('hidden');
        return;
    }

    socket.emit('rename room', { oldName: currentRoom, newName: newName });
    document.getElementById('renameRoomModal').classList.add('hidden');
});

socket.on('room renamed', (data) => {
    const { oldName, newName } = data;
    const li = document.querySelector(`.channel-item[data-room="${oldName}"]`);
    if (li) {
        li.setAttribute('data-room', newName);
        li.querySelector('.font-label-md').innerHTML = `# ${newName}`;
    }
    if (currentRoom === oldName) {
        currentRoom = newName;
        headerTitleText.textContent = `# ${newName}`;
    }
});

socket.on('room rename error', (msg) => { alert(msg); });

// --- NEW MESSAGE LOGIC ---
document.getElementById('new-message-btn').addEventListener('click', () => {
    msgSearch.clear();
    document.getElementById('new-message-text').value = '';
    document.getElementById('newMessageModal').classList.remove('hidden');
});

document.getElementById('send-new-msg-btn').addEventListener('click', () => {
    const text = document.getElementById('new-message-text').value.trim();
    const recipients = msgSearch.selected;
    
    if (recipients.length === 0 || !text) return alert('Select users and type a message.');
    document.getElementById('newMessageModal').classList.add('hidden');

    if (recipients.length === 1) {
        const targetUser = recipients[0];
        const dmRoomId = `DM-${[username, targetUser].sort().join('-')}`;
        ensureSidebarItemExists(dmRoomId, targetUser);
        const targetEl = document.querySelector(`.channel-item[data-room="${dmRoomId}"]`);
        switchRoom(targetEl);
        navChatBtn.click();
        setTimeout(() => { socket.emit('chat message', { user: username, text: text, room: dmRoomId }); }, 100);
    } else {
        const roomName = `Group-${Math.random().toString(36).substring(2, 8)}`;
        const members = [...recipients, username];
        socket.emit('create custom channel', { name: roomName, members: members });
        
        const li = addChannelToSidebar(roomName, channelList);
        switchRoom(li);
        navChatBtn.click();
        setTimeout(() => { socket.emit('chat message', { user: username, text: text, room: roomName }); }, 200);
    }
});

// --- CREATE CHANNEL LOGIC ---
document.getElementById('create-channel-btn').addEventListener('click', () => {
    channelSearch.clear();
    document.getElementById('new-channel-name').value = '';
    document.getElementById('createChannelModal').classList.remove('hidden');
});

document.getElementById('submit-channel-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('new-channel-name').value.trim().replace(/\s+/g, '-');
    if (!nameInput) return;
    const selectedUsers = [...channelSearch.selected, username];
    socket.emit('create custom channel', { name: nameInput, members: selectedUsers });
    document.getElementById('createChannelModal').classList.add('hidden');
});

socket.on('new custom channel', (channelName) => { addChannelToSidebar(channelName, channelList); });

// --- MEMBER MANAGEMENT LOGIC ---
membersBtn.addEventListener('click', () => {
    const listContainer = document.getElementById('members-list-container'); 
    listContainer.innerHTML = '';
    
    let currentMembers = [];
    let canEdit = false;

    if (currentRoom === 'General') {
        currentMembers = allSystemUsers; 
        canEdit = false; 
    } else if (currentRoom.startsWith('DM-')) {
        currentMembers = currentRoom.replace('DM-', '').split('-');
        canEdit = false;
    } else if (currentRoom.startsWith('Group-')) {
        currentMembers = [username, ...mentionableUsers].filter((v,i,a) => a.indexOf(v)===i);
        canEdit = true; 
    } else {
        currentMembers = [username, ...mentionableUsers].filter((v,i,a) => a.indexOf(v)===i);
        if (userRole === 'admin' || userRole === 'central') canEdit = true; 
    }

    document.getElementById('members-count-label').textContent = `${currentMembers.length} users`;
    
    const addSection = document.getElementById('admin-add-member-section');
    if (canEdit) {
        addSection.classList.remove('hidden');
        addSection.classList.add('block');
        memberSearch.clear();
    } else {
        addSection.classList.add('hidden');
        addSection.classList.remove('block');
    }

    currentMembers.sort((a, b) => { if (a === username) return -1; if (b === username) return 1; return a.localeCompare(b); });
    
    currentMembers.forEach(member => {
        const isOnline = availableUsers.includes(member) || member === username;
        const div = document.createElement('div'); 
        div.className = "flex items-center justify-between p-2 hover:bg-surface-container-low rounded-lg transition-colors group";
        
        let innerHtml = `
            <div class="flex items-center gap-3 cursor-pointer flex-1" onclick="document.getElementById('membersModal').classList.add('hidden'); openedProfileFromMembers = true; fetchAndShowProfile('${member}')" title="View Profile">
                <div class="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-xs relative hover:ring-2 hover:ring-primary/50 transition-all">
                    ${member.charAt(0).toUpperCase()}
                    <span class="absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-surface rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}"></span>
                </div>
                <span class="font-body-sm font-bold text-on-surface">${member === username ? member + ' (You)' : member}</span>
            </div>
        `;
        
        if (canEdit && member !== username) {
            innerHtml += `
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-md transition-colors flex items-center justify-center" onclick="promoteToAdmin('${member}')" title="Make Global Admin">
                    <span class="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                </button>
                <button class="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/50 rounded-md transition-colors flex items-center justify-center" onclick="removeChannelMember('${member}')" title="Remove User from Room">
                    <span class="material-symbols-outlined text-[18px]">person_remove</span>
                </button>
            </div>`;
        }
        
        div.innerHTML = innerHtml;
        listContainer.appendChild(div);
    });
    document.getElementById('membersModal').classList.remove('hidden');
});

document.getElementById('add-members-submit-btn').addEventListener('click', () => {
    if(memberSearch.selected.length === 0) return alert("Please search and select users first.");
    socket.emit('add channel members', { room: currentRoom, newUsers: memberSearch.selected });
    memberSearch.clear();
});

document.getElementById('remove-members-submit-btn').addEventListener('click', () => {
    if(memberSearch.selected.length === 0) return alert("Please search and select users first.");
    if(confirm(`Are you sure you want to bulk-remove the selected users from this room?`)) {
        socket.emit('bulk remove channel members', { room: currentRoom, usersToRemove: memberSearch.selected });
        memberSearch.clear();
    }
});

window.removeChannelMember = function(userToRemove) {
    if(confirm(`Are you sure you want to remove ${userToRemove} from this room?`)) {
        socket.emit('remove channel member', { room: currentRoom, userToRemove });
    }
};

window.promoteToAdmin = function(targetUser) {
    if(confirm(`Promote ${targetUser} to Global Admin? They will have access to create and manage all channels.`)) {
        socket.emit('promote to admin', targetUser);
    }
};

socket.on('user promoted', (promotedUser) => {
    if (promotedUser === username) {
        userRole = 'admin';
        document.getElementById('create-channel-btn').classList.remove('hidden');
        document.getElementById('create-channel-btn').classList.add('block');
        alert("You have been promoted to a Project Admin!");
    }
});

socket.on('room directory update', () => {
    socket.emit('join room', { room: currentRoom, username: username }); 
    setTimeout(() => {
        if (!document.getElementById('membersModal').classList.contains('hidden')) {
            document.getElementById('members-btn').click(); 
        }
    }, 200);
});

socket.on('removed from channel', (roomName) => {
    const item = document.querySelector(`.channel-item[data-room="${roomName}"]`);
    if (item) item.remove();
    if (currentRoom === roomName) {
        const gen = document.querySelector(`.channel-item[data-room="General"]`);
        if (gen) switchRoom(gen);
    }
});


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
  senderName.className = 'font-label-md text-label-md text-on-surface';
  senderName.textContent = isMe ? 'You' : data.user;

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
      const avatarDiv = document.createElement('div'); 
      avatarDiv.className = 'w-8 h-8 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center text-primary font-bold mb-6 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all shadow-sm'; 
      avatarDiv.textContent = data.user.charAt(0).toUpperCase(); 
      avatarDiv.addEventListener('click', () => {
          openedProfileFromMembers = false;
          fetchAndShowProfile(data.user);
      });
      container.appendChild(avatarDiv);
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

// FIX: Smart Profile Closing
window.closeProfileModal = function() {
    document.getElementById('profile-overlay').classList.add('hidden');
    if (openedProfileFromMembers) {
        document.getElementById('membersModal').classList.remove('hidden');
        openedProfileFromMembers = false;
    }
};

window.viewCalendarFromProfile = function(targetUser) {
    window.closeProfileModal();
    navCalendarBtn.click();
    socket.emit('get user calendar', targetUser);
};

socket.on('user calendar data', (data) => {
    viewingOtherUser = data.targetUser;
    otherUserEvents = data.events;
    document.getElementById('other-calendar-name').textContent = data.targetUser;
    document.getElementById('viewing-other-calendar-banner').classList.remove('hidden');
    if(!document.getElementById('calendar-month-label').innerHTML.includes('Read Only')) {
        document.getElementById('calendar-month-label').innerHTML += ` <span class="text-sm font-normal text-on-surface-variant bg-surface-container-low px-2 py-1 rounded shadow-sm">Read Only</span>`;
    }
    renderCalendar();
});

document.getElementById('return-my-calendar-btn').addEventListener('click', () => {
    viewingOtherUser = null;
    document.getElementById('viewing-other-calendar-banner').classList.add('hidden');
    const label = document.getElementById('calendar-month-label');
    if(label.querySelector('span')) label.querySelector('span').remove();
    socket.emit('get events');
});

socket.on('profile data', (data) => {
    document.getElementById('profile-avatar').textContent = data.username.charAt(0).toUpperCase(); document.getElementById('profile-name').textContent = data.username; document.getElementById('profile-role').textContent = data.role === 'user' ? 'Standard User' : data.role;
    document.getElementById('profile-email').textContent = data.email || 'Not set'; document.getElementById('profile-contact').textContent = data.contact || 'Not set'; document.getElementById('profile-status-msg').textContent = data.status_msg || 'Available';
    const isOnline = availableUsers.includes(data.username) || data.username === username;
    const statusContainer = document.getElementById('profile-online-status'); const statusDot = document.getElementById('profile-status-dot'); const statusText = document.getElementById('profile-status-text');
    if (isOnline) { statusContainer.className = "mt-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 bg-green-100 text-green-700"; statusDot.className = "w-2 h-2 rounded-full bg-green-500"; statusText.textContent = "Online"; } 
    else { statusContainer.className = "mt-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 bg-gray-100 text-gray-600"; statusDot.className = "w-2 h-2 rounded-full bg-gray-400"; statusText.textContent = "Offline"; }
    
    const actionsContainer = document.getElementById('profile-actions'); actionsContainer.innerHTML = ''; 
    if (data.username === username) {
        actionsContainer.innerHTML = `<button class="w-full bg-surface-container-high text-on-surface py-2 rounded-lg hover:bg-border-subtle transition-colors flex items-center justify-center gap-2 font-bold text-sm"><span class="material-symbols-outlined text-[18px]">settings</span> Settings</button>`;
    } else {
        actionsContainer.innerHTML = `
            <button onclick="messageFromProfile('${data.username}')" class="flex-1 bg-primary-container text-on-primary py-2 rounded-lg hover:bg-primary transition-colors flex items-center justify-center gap-2 font-bold text-sm shadow-sm"><span class="material-symbols-outlined text-[18px]">chat</span> Message</button>
            <button onclick="viewCalendarFromProfile('${data.username}')" class="flex-1 bg-surface-container-low text-on-surface-variant border border-border-subtle py-2 rounded-lg hover:bg-surface-container transition-colors flex items-center justify-center gap-2 font-bold text-sm shadow-sm"><span class="material-symbols-outlined text-[18px]">calendar_today</span> View Calendar</button>
        `;
    }
    document.getElementById('profile-overlay').classList.remove('hidden');
});

// FIX: Added the missing openDirectMessage function!
window.openDirectMessage = function(targetUser) {
    const dmRoomId = `DM-${[username, targetUser].sort().join('-')}`;
    ensureSidebarItemExists(dmRoomId, targetUser);
    const targetEl = document.querySelector(`.channel-item[data-room="${dmRoomId}"]`);
    if (targetEl) {
        switchRoom(targetEl);
        navChatBtn.click();
    }
};

window.messageFromProfile = function(targetUser) { window.closeProfileModal(); window.openDirectMessage(targetUser); };

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
document.getElementById('open-invites-btn').addEventListener('click', () => { document.getElementById('invitesModal').classList.remove('hidden'); });

function updateInvitesUI() {
    const invitesContainer = document.getElementById('invites-list-container');
    const badge = document.getElementById('invites-badge');
    if(!invitesContainer || !badge) return;

    const pendingInvites = currentEvents.filter(evt => {
        if (evt.organizer === username) return false;
        const att = JSON.parse(evt.attendees).find(a => a.username === username);
        return att && att.status === 'pending';
    });

    if (pendingInvites.length > 0) {
        badge.textContent = pendingInvites.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    invitesContainer.innerHTML = '';
    if (pendingInvites.length === 0) {
        invitesContainer.innerHTML = '<p class="text-on-surface-variant text-center py-4 text-sm italic">No pending invites.</p>';
    } else {
        pendingInvites.forEach(evt => {
            const start = new Date(evt.start_time);
            const div = document.createElement('div');
            div.className = "bg-surface-container-lowest border border-border-subtle rounded-lg p-3 shadow-sm flex flex-col gap-2";
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-on-surface text-sm">${evt.title}</h4>
                        <p class="text-xs text-on-surface-variant mt-0.5"><span class="font-semibold text-primary">${evt.organizer}</span> invited you</p>
                    </div>
                </div>
                <div class="text-xs text-on-surface-variant flex items-center gap-1 bg-surface-container-low p-1.5 rounded w-fit">
                    <span class="material-symbols-outlined text-[14px]">schedule</span>
                    ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
                <div class="flex gap-2 mt-1">
                    <button onclick="rsvpEvent('${evt.id}', 'declined'); document.getElementById('invitesModal').classList.add('hidden')" class="flex-1 py-1.5 border border-border-subtle rounded hover:bg-error hover:text-white transition-colors text-sm font-bold text-on-surface-variant">Decline</button>
                    <button onclick="rsvpEvent('${evt.id}', 'accepted'); document.getElementById('invitesModal').classList.add('hidden')" class="flex-1 py-1.5 bg-primary text-on-primary rounded hover:bg-primary/90 transition-colors shadow-sm text-sm font-bold">Accept</button>
                </div>
            `;
            invitesContainer.appendChild(div);
        });
    }
}

function updateUpcomingEvents() {
    const list = document.getElementById('upcoming-events-list');
    if(!list) return;
    list.innerHTML = '';
    
    const today = new Date();
    const eventsToUse = viewingOtherUser ? otherUserEvents : currentEvents;
    
    const todayEvents = eventsToUse.filter(evt => {
        if (!viewingOtherUser && evt.organizer !== username) {
            const att = JSON.parse(evt.attendees).find(a => a.username === username);
            if (!att || att.status !== 'accepted') return false;
        }
        
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

function renderCalendar() {
    gridContainer.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const labelSpan = monthLabel.querySelector('span');
    monthLabel.innerHTML = `${monthNames[month]} ${year}`;
    if (labelSpan) monthLabel.appendChild(labelSpan);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'bg-surface p-2 min-h-[100px] bg-surface-container-low/50';
        gridContainer.appendChild(emptyDiv);
    }

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
    
    plotEvents();
    updateUpcomingEvents();
    if (!viewingOtherUser) updateInvitesUI();
}

function plotEvents() {
    document.querySelectorAll('.events-container').forEach(el => el.innerHTML = '');
    const eventsToUse = viewingOtherUser ? otherUserEvents : currentEvents;
    
    eventsToUse.forEach(evt => {
        const startDate = new Date(evt.start_time);
        const y = startDate.getFullYear();
        const m = startDate.getMonth();
        const d = startDate.getDate();
        
        const targetContainer = document.getElementById(`day-${y}-${m}-${d}`);
        if (targetContainer) {
            
            if (viewingOtherUser) {
                const timeString = startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const pill = document.createElement('div');
                pill.className = `bg-surface-container text-on-surface-variant rounded px-2 py-1 text-xs truncate flex items-center gap-1 opacity-80`;
                pill.innerHTML = `<span class="material-symbols-outlined text-[12px] flex-shrink-0">lock</span> ${timeString} - Busy`;
                targetContainer.appendChild(pill);
                return; 
            }

            const myRsvpStatus = JSON.parse(evt.attendees).find(a => a.username === username)?.status || 'pending';
            const isOrg = evt.organizer === username;
            
            if (!isOrg && myRsvpStatus === 'declined') {
                return; 
            }

            let colorClass = 'bg-surface-container-high text-on-surface-variant border border-border-subtle border-dashed'; 
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

socket.on('events data', (events) => {
    currentEvents = events;
    renderCalendar();
});

socket.on('event refresh', () => {
    if (calendarView.classList.contains('flex') && !viewingOtherUser) socket.emit('get events');
});

let isAssistantOpen = false;
let pendingOverlapCallback = null; 

document.getElementById('event-start').addEventListener('change', function() {
    const startVal = this.value;
    if(startVal) {
        document.getElementById('event-end').min = startVal;
        
        const startDate = new Date(startVal);
        const endDateInput = document.getElementById('event-end');
        
        const currentEnd = new Date(endDateInput.value);
        if(!endDateInput.value || currentEnd <= startDate) {
            const newEnd = new Date(startDate.getTime() + 15 * 60000);
            const tzOffset = newEnd.getTimezoneOffset() * 60000;
            const localISOTime = (new Date(newEnd - tzOffset)).toISOString().slice(0,16);
            endDateInput.value = localISOTime;
        }
        if(isAssistantOpen) updateAssistantGrid();
    }
});

window.addTimeToEnd = function(minutes) {
    const startVal = document.getElementById('event-start').value;
    if(!startVal) return alert("Please set a Start time first.");
    
    const startDate = new Date(startVal);
    const newEnd = new Date(startDate.getTime() + minutes * 60000);
    const tzOffset = newEnd.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(newEnd - tzOffset)).toISOString().slice(0,16);
    
    document.getElementById('event-end').value = localISOTime;
    if(isAssistantOpen) updateAssistantGrid();
};

document.getElementById('event-end').addEventListener('change', () => {
    if(isAssistantOpen) updateAssistantGrid();
});

document.getElementById('toggle-assistant-btn').addEventListener('click', () => {
    isAssistantOpen = !isAssistantOpen;
    const modal = document.getElementById('newMeetingModalContent');
    const pane = document.getElementById('scheduling-assistant-pane');
    const btn = document.getElementById('toggle-assistant-btn');
    
    if(isAssistantOpen) {
        modal.classList.replace('max-w-lg', 'max-w-5xl');
        pane.classList.remove('hidden'); pane.classList.add('flex');
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">close_fullscreen</span> Close Scheduling Assistant`;
        updateAssistantGrid();
    } else {
        modal.classList.replace('max-w-5xl', 'max-w-lg');
        pane.classList.add('hidden'); pane.classList.remove('flex');
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">calendar_month</span> Open Scheduling Assistant`;
    }
});

window.updateAssistantGrid = function() {
    const grid = document.getElementById('assistant-attendees-grid');
    if(!grid) return;
    
    grid.innerHTML = '';
    grid.style.height = '1520px'; 
    grid.classList.remove('h-[1440px]');
    
    const timeCol = document.createElement('div');
    timeCol.className = 'flex flex-col sticky left-0 bg-surface-container-low z-20 min-w-[60px] border-r border-border-subtle';
    
    const spacer = document.createElement('div');
    spacer.className = "h-[60px] mb-2 flex-shrink-0 bg-surface-container-low"; 
    timeCol.appendChild(spacer);

    const timeBody = document.createElement('div');
    timeBody.className = "flex-1 relative w-full";
    
    for(let i=0; i<=24; i++) {
        if (i===24) continue; 
        const hour = i === 0 ? 12 : (i > 12 ? i - 12 : i);
        const ampm = i < 12 ? 'AM' : 'PM';
        const timeStr = `${hour.toString().padStart(2, '0')}:00 ${ampm}`;
        const label = document.createElement('div');
        label.className = "absolute left-0 right-2 text-[10px] text-on-surface-variant/60 text-right";
        label.style.top = `${i * 60 - 7}px`; 
        label.textContent = timeStr;
        timeBody.appendChild(label);
    }
    timeCol.appendChild(timeBody);
    grid.appendChild(timeCol);
    
    const attendeesToShow = [username, ...meetingSearch.selected];
    const startInput = document.getElementById('event-start').value;
    const endInput = document.getElementById('event-end').value;
    
    let topOffset = 0; let blockHeight = 0; let hasValidTime = false;
    
    if(startInput && endInput) {
        const [startH, startM] = startInput.split('T')[1].split(':').map(Number);
        const [endH, endM] = endInput.split('T')[1].split(':').map(Number);
        
        topOffset = (startH * 60) + startM;
        const totalEndMins = (endH * 60) + endM;
        blockHeight = totalEndMins - topOffset;
        if(blockHeight < 0) blockHeight = (24 * 60) - topOffset; 
        
        hasValidTime = true;
        const startD = new Date(startInput); 
        document.getElementById('assistant-date-label').textContent = startD.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    } else {
        document.getElementById('assistant-date-label').textContent = "Select a start time";
    }
    
    const targetDateStr = startInput ? startInput.split('T')[0] : null;

    attendeesToShow.forEach(att => {
        const col = document.createElement('div');
        col.className = "flex flex-col min-w-[100px] flex-1 relative";
        
        const header = document.createElement('div');
        header.className = "text-center mb-2 sticky top-0 bg-surface-container-low z-10 pt-2 pb-1 h-[60px] flex flex-col items-center justify-center flex-shrink-0";
        header.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-surface-container-high border border-border-subtle mx-auto mb-1 flex items-center justify-center text-[10px] font-bold text-on-surface-variant">${att.charAt(0).toUpperCase()}</div>
            <span class="text-[10px] block truncate text-on-surface font-bold">${att === username ? att + ' (You)' : att}</span>
        `;
        col.appendChild(header);
        
        const body = document.createElement('div');
        body.className = "flex-1 bg-surface-container-lowest rounded border border-border-subtle relative overflow-hidden h-[1440px]";
        
        for(let i=0; i<=24; i++) {
            const line = document.createElement('div');
            line.className = "absolute left-0 right-0 border-t border-border-subtle/50";
            line.style.top = `${i * 60}px`;
            body.appendChild(line);
        }
        
        if (targetDateStr) {
            currentEvents.forEach(evt => {
                const isOrg = evt.organizer === att;
                const myAtt = JSON.parse(evt.attendees).find(a => a.username === att);
                
                if (isOrg || (myAtt && myAtt.status === 'accepted')) {
                    if (evt.start_time.startsWith(targetDateStr)) {
                        const [eStartH, eStartM] = evt.start_time.split('T')[1].split(':').map(Number);
                        const [eEndH, eEndM] = evt.end_time ? evt.end_time.split('T')[1].split(':').map(Number) : [eStartH + 1, eStartM];
                        
                        const evtTop = (eStartH * 60) + eStartM;
                        const evtHeight = ((eEndH * 60) + eEndM) - evtTop;
                        
                        const busyBlock = document.createElement('div');
                        busyBlock.className = "absolute left-0 right-0 bg-surface-container text-on-surface-variant flex justify-center items-center overflow-hidden z-0 opacity-80 border-l-4 border-outline";
                        busyBlock.style.top = `${evtTop}px`;
                        busyBlock.style.height = `${evtHeight}px`;
                        busyBlock.innerHTML = `<span class="material-symbols-outlined text-[12px]">lock</span>`;
                        body.appendChild(busyBlock);
                    }
                }
            });
        }
        
        if(hasValidTime) {
            const block = document.createElement('div');
            block.className = "absolute left-0 right-0 border-y-2 border-primary overflow-hidden z-10 shadow-sm transition-all cursor-pointer";
            block.style.background = 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0, 74, 198, 0.1) 4px, rgba(0, 74, 198, 0.1) 8px)';
            block.style.top = `${topOffset}px`;
            block.style.height = `${blockHeight}px`;
            body.appendChild(block);
        }
        col.appendChild(body); grid.appendChild(col);
    });
    
    if(hasValidTime) {
        const scrollContainer = document.getElementById('assistant-scroll-container');
        if(scrollContainer) scrollContainer.scrollTop = Math.max(0, topOffset - 100);
    }
};

window.closeNewMeetingModal = function() {
    document.getElementById('newMeetingModal').classList.add('hidden');
    if(isAssistantOpen) document.getElementById('toggle-assistant-btn').click();
    meetingSearch.clear();
};

document.getElementById('open-new-meeting-btn').addEventListener('click', () => {
    document.getElementById('event-title').value = '';
    document.getElementById('event-start').value = '';
    document.getElementById('event-end').value = '';
    document.getElementById('event-desc').value = '';
    meetingSearch.clear();
    document.getElementById('newMeetingModal').classList.remove('hidden');
});

function showOverlapWarning(onConfirmCallback) {
    pendingOverlapCallback = onConfirmCallback;
    document.getElementById('overlapModal').classList.remove('hidden');
}

document.getElementById('overlap-cancel-btn').addEventListener('click', () => {
    document.getElementById('overlapModal').classList.add('hidden');
    pendingOverlapCallback = null;
});

document.getElementById('overlap-confirm-btn').addEventListener('click', () => {
    document.getElementById('overlapModal').classList.add('hidden');
    if (pendingOverlapCallback) {
        pendingOverlapCallback();
        pendingOverlapCallback = null;
    }
});

function hasOverlap(newStart, newEnd) {
    const start = new Date(newStart).getTime();
    const end = new Date(newEnd).getTime();
    
    return currentEvents.some(evt => {
        const isOrg = evt.organizer === username;
        const myAtt = JSON.parse(evt.attendees).find(a => a.username === username);
        
        if (!isOrg && (!myAtt || myAtt.status !== 'accepted')) return false;

        const eStart = new Date(evt.start_time).getTime();
        const eEnd = evt.end_time ? new Date(evt.end_time).getTime() : eStart + 3600000; 
        
        return start < eEnd && end > eStart;
    });
}

document.getElementById('create-event-submit-btn').addEventListener('click', () => {
    const title = document.getElementById('event-title').value.trim();
    const startTime = document.getElementById('event-start').value;
    let endTime = document.getElementById('event-end').value;
    const desc = document.getElementById('event-desc').value.trim();
    
    if(!title || !startTime) return alert('Title and Start Time are required.');
    
    if (!endTime) {
        const defaultEnd = new Date(new Date(startTime).getTime() + 15 * 60000);
        endTime = new Date(defaultEnd.getTime() - (defaultEnd.getTimezoneOffset() * 60000)).toISOString().slice(0,16);
    }
    
    if (hasOverlap(startTime, endTime)) {
        showOverlapWarning(() => {
            socket.emit('create event', { title, startTime, endTime, description: desc, attendees: meetingSearch.selected });
            window.closeNewMeetingModal();
        });
        return; 
    }
    
    socket.emit('create event', { title, startTime, endTime, description: desc, attendees: meetingSearch.selected });
    window.closeNewMeetingModal();
});

function openEventDetails(evt) {
    document.getElementById('view-event-title').textContent = evt.title;
    const start = new Date(evt.start_time); const end = evt.end_time ? new Date(evt.end_time) : null;
    
    document.getElementById('view-event-date').textContent = start.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('view-event-time').textContent = start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + (end ? ` - ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : '');
    document.getElementById('view-event-org-initial').textContent = evt.organizer.charAt(0).toUpperCase();
    document.getElementById('view-event-org-name').textContent = evt.organizer === username ? `${evt.organizer} (You)` : evt.organizer;
    document.getElementById('view-event-desc').textContent = evt.description || "No description provided.";
    
    const attendeesList = document.getElementById('view-event-attendees'); attendeesList.innerHTML = '';
    const attendeesArray = JSON.parse(evt.attendees); document.getElementById('view-event-attendee-count').textContent = `Attendees (${attendeesArray.length})`;
    
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
                    <div class="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center text-xs font-bold text-on-surface-variant">${att.username.charAt(0).toUpperCase()}</div>
                    <span class="font-body-sm text-on-surface ${att.status === 'declined' ? 'line-through opacity-60' : ''}">${att.username}</span>
                </div>
                ${statusIcon}
            </div>
        `;
    });

    const actionsContainer = document.getElementById('view-event-actions'); actionsContainer.innerHTML = '';
    
    if(evt.organizer === username) {
        actionsContainer.innerHTML = `<button onclick="deleteEvent('${evt.id}')" class="text-error font-label-md text-label-md hover:bg-error-container/30 px-3 py-1.5 rounded transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">delete</span> Cancel Meeting</button><div></div>`;
    } else {
        actionsContainer.innerHTML = `<div></div>`;
        const btns = document.createElement('div'); btns.className = "flex gap-2";
        
        if (myRsvp === 'accepted') {
            btns.innerHTML = `
                <button onclick="rsvpEvent('${evt.id}', 'declined')" class="py-1.5 px-4 border border-border-subtle rounded text-error hover:bg-error-container/30 transition-colors flex items-center justify-center gap-1 font-bold text-sm shadow-sm"><span class="material-symbols-outlined text-[18px]">event_busy</span> Cancel</button>
            `;
        } else {
            btns.innerHTML = `
                <button onclick="rsvpEvent('${evt.id}', 'declined')" class="p-2 border border-border-subtle rounded ${myRsvp === 'declined' ? 'bg-error text-white' : 'bg-surface hover:bg-surface-container text-on-surface'} transition-colors" title="Decline"><span class="material-symbols-outlined text-[18px]">close</span></button>
                <button onclick="rsvpEvent('${evt.id}', 'accepted')" class="px-4 py-1.5 font-label-md text-label-md rounded shadow-sm transition-colors flex items-center gap-1 ${myRsvp === 'accepted' ? 'bg-green-600 text-white' : 'bg-primary text-on-primary hover:bg-primary/90'}"><span class="material-symbols-outlined text-[18px]">check</span> Accept</button>
            `;
        }
        actionsContainer.appendChild(btns);
    }
    document.getElementById('eventDetailsModal').classList.remove('hidden');
}

window.rsvpEvent = function(eventId, status) {
    if (status === 'accepted') {
        const evt = currentEvents.find(e => e.id === eventId);
        if (evt && hasOverlap(evt.start_time, evt.end_time)) {
            showOverlapWarning(() => {
                socket.emit('rsvp event', { eventId, status });
                document.getElementById('eventDetailsModal').classList.add('hidden');
            });
            return; 
        }
    }
    socket.emit('rsvp event', { eventId, status });
    document.getElementById('eventDetailsModal').classList.add('hidden');
};

window.deleteEvent = function(eventId) {
    if(confirm("Are you sure you want to cancel this meeting for everyone?")) {
        socket.emit('cancel event', eventId);
        document.getElementById('eventDetailsModal').classList.add('hidden');
    }
};