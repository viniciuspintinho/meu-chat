const socket = io();
const loginDiv = document.getElementById('login');
const msgContainer = document.getElementById('messages');
const userListDiv = document.getElementById('user-list');
const userCount = document.getElementById('user-count');
const typingIndicator = document.getElementById('typing-indicator');
const msgInput = document.getElementById('input');
const replyContainer = document.getElementById('reply-container');
const themeStyle = document.getElementById('theme-style-container');

let selectedReply = null;
let typingTimeout;

// INICIALIZAÇÃO
window.onload = () => {
    const savedUser = localStorage.getItem('chat_user');
    const savedColor = localStorage.getItem('chat_theme_color') || '#6366f1';
    
    themeStyle.style.setProperty('--theme-color', savedColor);

    if (savedUser) {
        const userData = JSON.parse(savedUser);
        socket.emit('join', userData);
        loginDiv.classList.add('hidden');
    }
};

function entrar() {
    const name = document.getElementById('username').value.trim();
    const avatar = document.getElementById('avatar').value.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
    if(name) {
        const userData = { name, avatar };
        localStorage.setItem('chat_user', JSON.stringify(userData));
        socket.emit('join', userData);
        loginDiv.classList.add('hidden');
    }
}

function logout() {
    localStorage.removeItem('chat_user');
    window.location.reload();
}

// CONFIGURAÇÕES E TEMAS
function openSettings() {
    const userData = JSON.parse(localStorage.getItem('chat_user'));
    document.getElementById('set-username').value = userData.name;
    document.getElementById('set-avatar').value = userData.avatar;
    document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
}

function changeTheme(name, hex) {
    themeStyle.style.setProperty('--theme-color', hex);
    localStorage.setItem('chat_theme_color', hex);
}

function saveSettings() {
    const name = document.getElementById('set-username').value.trim();
    const avatar = document.getElementById('set-avatar').value.trim();
    if(name) {
        localStorage.setItem('chat_user', JSON.stringify({ name, avatar }));
        window.location.reload();
    }
}

// RESPOSTAS E FOTOS
function setReply(name, text) {
    selectedReply = { name, text };
    document.getElementById('reply-name').innerText = name;
    document.getElementById('reply-text').innerText = text;
    replyContainer.classList.remove('hidden');
    msgInput.focus();
}

function cancelReply() {
    selectedReply = null;
    replyContainer.classList.add('hidden');
}

function enviarFoto() {
    const url = prompt("Cole o link da imagem:");
    if (url) {
        socket.emit('chatMessage', { text: url, replyTo: selectedReply });
        cancelReply();
    }
}

// SOCKET EVENTS
msgInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', false), 2000);
});

socket.on('displayTyping', (data) => {
    typingIndicator.innerText = data.typing ? `${data.name} está digitando...` : '';
});

socket.on('updateUserList', (users) => {
    userCount.innerText = users.length;
    userListDiv.innerHTML = users.map(u => `
        <div class="flex items-center gap-4 p-3 rounded-2xl">
            <img src="${u.avatar}" class="w-12 h-12 rounded-2xl border border-slate-700 object-cover">
            <span class="text-sm font-medium text-slate-200">${u.name}</span>
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
    const isImage = data.text.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null;
    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full mb-4 px-4`;
    
    let replyHtml = data.replyTo ? `
        <div class="bg-black/20 border-l-4 border-theme p-2 mb-2 rounded text-[10px] opacity-70">
            <b class="text-theme">${data.replyTo.name}</b>: ${data.replyTo.text}
        </div>
    ` : '';

    const messageContent = isImage 
        ? `<img src="${data.text}" class="rounded-xl max-w-full h-auto mt-2 border border-slate-700 shadow-md">`
        : `<p class="text-sm leading-relaxed">${data.text}</p>`;

    div.innerHTML = `
        <div class="flex gap-4 max-w-[80%] ${isMe ? 'flex-row-reverse' : 'flex-row'}">
            <img src="${data.avatar}" class="w-12 h-12 rounded-2xl shadow-lg flex-shrink-0 border-2 border-slate-800 object-cover">
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} group">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-bold text-slate-400">${data.name}</span>
                    <button onclick="setReply('${data.name}', '${data.text.substring(0,15)}...')" class="text-[10px] text-theme opacity-0 group-hover:opacity-100 transition underline cursor-pointer">Responder</button>
                </div>
                <div class="p-4 rounded-2xl ${isMe ? 'bg-theme text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none'} border border-white/5">
                    ${replyHtml}
                    ${messageContent}
                </div>
                <span class="text-[9px] text-slate-600 mt-1">${data.time}</span>
            </div>
        </div>
    `;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});