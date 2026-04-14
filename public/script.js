const socket = io();
const loginDiv = document.getElementById('login');
const msgContainer = document.getElementById('messages');
const userListDiv = document.getElementById('user-list');
const typingIndicator = document.getElementById('typing-indicator');
const msgInput = document.getElementById('input');
const replyContainer = document.getElementById('reply-container');

let selectedReply = null;
let typingTimeout;

// SISTEMA DE TEMA CORRIGIDO
function applyTheme(hex) {
    document.documentElement.style.setProperty('--theme-color', hex);
    localStorage.setItem('chat_theme_color', hex);
}

window.onload = () => {
    const savedUser = localStorage.getItem('chat_user');
    const savedColor = localStorage.getItem('chat_theme_color') || '#0095f6';
    applyTheme(savedColor);

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

function openSettings() {
    const userData = JSON.parse(localStorage.getItem('chat_user'));
    document.getElementById('set-username').value = userData.name;
    document.getElementById('set-avatar').value = userData.avatar;
    document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
}

function changeTheme(hex) {
    applyTheme(hex);
}

function saveSettings() {
    const name = document.getElementById('set-username').value.trim();
    const avatar = document.getElementById('set-avatar').value.trim();
    if(name) {
        localStorage.setItem('chat_user', JSON.stringify({ name, avatar }));
        window.location.reload(); // Recarrega para aplicar as mudanças de perfil
    }
}

function setReply(name, text) {
    selectedReply = { name, text };
    document.getElementById('reply-text').innerText = `${name}: ${text}`;
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

msgInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', false), 2000);
});

socket.on('displayTyping', (data) => {
    typingIndicator.innerText = data.typing ? `${data.name} está digitando...` : '';
});

socket.on('updateUserList', (users) => {
    userListDiv.innerHTML = users.map(u => `
        <div class="flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition group">
            <img src="${u.avatar}" class="w-12 h-12 rounded-full object-cover border-2 border-transparent group-hover:border-theme transition p-0.5">
            <span class="text-sm font-semibold text-gray-300 group-hover:text-white transition">${u.name}</span>
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
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full mb-3 px-2`;
    
    let replyHtml = data.replyTo ? `
        <div class="bg-black/30 border-l-2 border-white/50 p-2 mb-2 rounded text-[10px] italic">
            <b>${data.replyTo.name}</b>: ${data.replyTo.text}
        </div>
    ` : '';

    const messageContent = isImage 
        ? `<img src="${data.text}" class="rounded-2xl max-w-full h-auto mt-2 border border-white/10 shadow-xl">`
        : `<p class="text-[14px] leading-relaxed font-medium">${data.text}</p>`;

    div.innerHTML = `
        <div class="flex gap-3 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end group">
            <img src="${data.avatar}" class="w-8 h-8 rounded-full border border-[#222] shadow-lg">
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <div class="px-5 py-3 rounded-[24px] ${isMe ? 'bubble-me text-white rounded-tr-none' : 'bubble-other text-gray-100 rounded-tl-none border border-[#333]'}">
                    ${replyHtml}
                    ${messageContent}
                </div>
                <div class="flex gap-3 mt-1 px-2 items-center">
                    <span class="text-[9px] text-gray-600 font-bold">${data.time}</span>
                    <button onclick="setReply('${data.name}', '${data.text.substring(0,15)}...')" class="text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 transition font-extrabold uppercase tracking-tighter">Responder</button>
                </div>
            </div>
        </div>
    `;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});