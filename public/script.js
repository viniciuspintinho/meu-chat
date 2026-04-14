const socket = io();
const loginDiv = document.getElementById('login');
const msgContainer = document.getElementById('messages');
const userListDiv = document.getElementById('user-list');
const typingIndicator = document.getElementById('typing-indicator');
const msgInput = document.getElementById('input');
const replyContainer = document.getElementById('reply-container');

// ADICIONE SEU NOME AQUI PARA O SELO FUNCIONAR
const ADMIN_NAME = "SEU_NOME_AQUI"; 

let selectedReply = null;
let typingTimeout;

function applyTheme(hex) {
    document.documentElement.style.setProperty('--theme-color', hex);
    localStorage.setItem('chat_theme_color', hex);
}

window.onload = () => {
    const savedUser = localStorage.getItem('chat_user');
    const savedColor = localStorage.getItem('chat_theme_color') || '#0095f6';
    applyTheme(savedColor);
    if (savedUser) {
        socket.emit('join', JSON.parse(savedUser));
        loginDiv.classList.add('hidden');
    }
};

function entrar() {
    const name = document.getElementById('username').value.trim();
    const avatar = document.getElementById('avatar').value.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
    if(name) {
        localStorage.setItem('chat_user', JSON.stringify({ name, avatar }));
        socket.emit('join', { name, avatar });
        loginDiv.classList.add('hidden');
    }
}

function logout() { localStorage.removeItem('chat_user'); window.location.reload(); }
function openSettings() {
    const userData = JSON.parse(localStorage.getItem('chat_user'));
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
        localStorage.setItem('chat_user', JSON.stringify({ name, avatar }));
        window.location.reload();
    }
}

function setReply(name, text) {
    selectedReply = { name, text };
    document.getElementById('reply-text').innerText = `${name}: ${text}`;
    replyContainer.classList.remove('hidden');
}
function cancelReply() { selectedReply = null; replyContainer.classList.add('hidden'); }
function enviarFoto() {
    const url = prompt("Link da foto:");
    if(url) socket.emit('chatMessage', { text: url, replyTo: selectedReply });
    cancelReply();
}

msgInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', false), 2000);
});

socket.on('displayTyping', (data) => {
    typingIndicator.innerText = data.typing ? `${data.name} digitando...` : '';
});

socket.on('updateUserList', (users) => {
    userListDiv.innerHTML = users.map(u => `
        <div class="flex items-center gap-4 p-3">
            <img src="${u.avatar}" class="w-10 h-10 rounded-full border-2 ${u.name === ADMIN_NAME ? 'border-yellow-500' : 'border-transparent'}">
            <span class="text-sm ${u.name === ADMIN_NAME ? 'adm-name' : 'text-gray-300'}">${u.name}</span>
        </div>
    `).join('');
});

document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    if (msgInput.value.trim() !== "") {
        socket.emit('chatMessage', { text: msgInput.value, replyTo: selectedReply });
        msgInput.value = '';
        cancelReply();
    }
};

socket.on('message', (data) => {
    const isMe = data.id === socket.id;
    const isAdmin = data.name === ADMIN_NAME;
    const isImage = data.text.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null;
    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full mb-3 px-2`;
    
    let replyHtml = data.replyTo ? `<div class="bg-black/30 border-l-2 p-2 mb-2 rounded text-[10px] italic"><b>${data.replyTo.name}</b>: ${data.replyTo.text}</div>` : '';
    const badge = isAdmin ? `<span style="font-size: 8px; background: #ffd700; color: #000; padding: 1px 4px; border-radius: 4px; margin-left: 5px; font-weight: 900;">CRIADOR</span>` : '';

    div.innerHTML = `
        <div class="flex gap-3 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end group">
            <img src="${data.avatar}" class="w-8 h-8 rounded-full border ${isAdmin ? 'border-yellow-500 shadow-[0_0_10px_rgba(255,215,0,0.3)]' : 'border-transparent'}">
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <span class="text-[10px] mb-1 ${isAdmin ? 'adm-name' : 'text-gray-500'}">${data.name}${badge}</span>
                <div class="px-5 py-3 rounded-[24px] ${isAdmin ? 'adm-bubble' : ''} ${isMe ? 'bg-theme text-white rounded-tr-none' : 'bg-slate-800 text-gray-100 rounded-tl-none border border-[#333]'}">
                    ${replyHtml}
                    ${isImage ? `<img src="${data.text}" class="rounded-xl max-w-full">` : `<p class="text-sm">${data.text}</p>`}
                </div>
                <div class="flex gap-2 mt-1 px-2 items-center">
                    <span class="text-[8px] text-gray-600">${data.time}</span>
                    <button onclick="setReply('${data.name}', '${data.text.substring(0,10)}')" class="text-[8px] opacity-0 group-hover:opacity-100 uppercase font-bold text-gray-500">Responder</button>
                </div>
            </div>
        </div>
    `;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});