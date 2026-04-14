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

window.onload = () => {
    const savedUser = localStorage.getItem('chat_user');
    const savedColor = localStorage.getItem('chat_theme_color') || '#0095f6';
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
        <div class="flex items-center gap-3 p-3 rounded-lg hover:bg-[#121212] transition cursor-default">
            <img src="${u.avatar}" class="w-12 h-12 rounded-full object-cover border border-[#262626] p-0.5 shadow-md">
            <span class="text-sm font-medium text-gray-200 truncate">${u.name}</span>
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
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full mb-2 px-2`;
    
    let replyHtml = data.replyTo ? `
        <div class="bg-white/5 border-l-2 border-theme p-2 mb-2 rounded text-[10px] opacity-60">
            <b class="text-white">${data.replyTo.name}</b>: ${data.replyTo.text}
        </div>
    ` : '';

    const messageContent = isImage 
        ? `<img src="${data.text}" class="rounded-lg max-w-full h-auto mt-2 border border-[#262626]">`
        : `<p class="text-[13px] leading-5 font-medium">${data.text}</p>`;

    div.innerHTML = `
        <div class="flex gap-3 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end group">
            <img src="${data.avatar}" class="w-8 h-8 rounded-full border border-[#262626] flex-shrink-0">
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <div class="px-4 py-2.5 rounded-[22px] ${isMe ? 'bubble-me text-white' : 'bubble-other text-gray-200'}">
                    ${replyHtml}
                    ${messageContent}
                </div>
                <div class="flex gap-3 mt-1 px-2 items-center">
                    <span class="text-[10px] text-gray-600">${data.time}</span>
                    <button onclick="setReply('${data.name}', '${data.text.substring(0,15)}...')" class="text-[10px] text-gray-500 opacity-0 group-hover:opacity-100 transition font-bold">Responder</button>
                </div>
            </div>
        </div>
    `;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});