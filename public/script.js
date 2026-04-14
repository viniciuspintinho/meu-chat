const socket = io();
const loginDiv = document.getElementById('login');
const msgContainer = document.getElementById('messages');
const userListDiv = document.getElementById('user-list');
const msgInput = document.getElementById('input');

const ADMIN_NAME = "vn7"; 

function applyTheme(hex) {
    document.documentElement.style.setProperty('--theme-color', hex);
    localStorage.setItem('chat_theme_color', hex);
    document.querySelectorAll('.theme-dot').forEach(dot => {
        dot.classList.remove('active');
        if(dot.style.backgroundColor === hex || dot.getAttribute('style').includes(hex)) dot.classList.add('active');
    });
}

window.onload = () => {
    const sessionUser = sessionStorage.getItem('chat_user');
    const savedColor = localStorage.getItem('chat_theme_color') || '#0095f6';
    applyTheme(savedColor);
    if (sessionUser) {
        socket.emit('join', JSON.parse(sessionUser));
        loginDiv.classList.add('hidden');
    }
};

function entrar() {
    const name = document.getElementById('username').value.trim();
    const avatar = document.getElementById('avatar').value.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
    if(name) {
        const userData = { name, avatar };
        sessionStorage.setItem('chat_user', JSON.stringify(userData));
        socket.emit('join', userData);
        loginDiv.classList.add('hidden');
    }
}

function logout() { sessionStorage.removeItem('chat_user'); window.location.reload(); }
function openSettings() {
    const userData = JSON.parse(sessionStorage.getItem('chat_user'));
    document.getElementById('set-username').value = userData.name;
    document.getElementById('set-avatar').value = userData.avatar;
    document.getElementById('settings-modal').classList.remove('hidden');
}
function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }
function changeTheme(hex) { applyTheme(hex); }
function saveSettings() {
    const name = document.getElementById('set-username').value.trim();
    const avatar = document.getElementById('set-avatar').value.trim();
    if(name) {
        sessionStorage.setItem('chat_user', JSON.stringify({ name, avatar }));
        window.location.reload();
    }
}

// MENSAGEM DE SISTEMA (Entrou/Saiu)
socket.on('systemMessage', (msg) => {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.innerText = msg;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

socket.on('updateUserList', (users) => {
    userListDiv.innerHTML = users.map(u => {
        const isAdm = u.name === ADMIN_NAME;
        return `
            <div class="flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl transition">
                <img src="${u.avatar}" class="w-10 h-10 rounded-full border-2 ${isAdm ? 'border-yellow-500' : 'border-transparent'}">
                <span class="text-sm ${isAdm ? 'adm-name' : 'text-gray-300'} font-bold">${isAdm ? '[ADM] ' : ''}${u.name}</span>
            </div>
        `;
    }).join('');
});

document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    if (msgInput.value.trim() !== "") {
        socket.emit('chatMessage', { text: msgInput.value });
        msgInput.value = '';
    }
};

socket.on('message', (data) => {
    const isMe = data.id === socket.id;
    const senderIsAdmin = data.name === ADMIN_NAME;
    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full mb-3 px-2`;
    
    const displayName = senderIsAdmin ? `[ADM] ${data.name}` : data.name;
    const badge = senderIsAdmin ? `<span class="badge-criador">CRIADOR</span>` : '';
    const bubbleStyle = isMe ? 'bubble-me rounded-tr-none' : 'bg-[#262626] text-gray-100 rounded-tl-none border border-[#333]';

    div.innerHTML = `
        <div class="flex gap-3 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end group">
            <img src="${data.avatar}" class="w-8 h-8 rounded-full border ${senderIsAdmin ? 'border-yellow-500' : 'border-transparent'}">
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <div class="flex items-center mb-1">
                    <span class="text-[10px] ${senderIsAdmin ? 'adm-name' : 'text-gray-500'} font-semibold">${displayName}</span>
                    ${badge}
                </div>
                <div class="px-5 py-3 rounded-[24px] ${bubbleStyle}">
                    <p class="text-sm">${data.text}</p>
                </div>
                <span class="text-[8px] text-gray-600 mt-1 opacity-0 group-hover:opacity-100 transition">${data.time}</span>
            </div>
        </div>
    `;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});