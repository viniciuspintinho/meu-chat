const socket = io();
const loginDiv = document.getElementById('login');
const msgContainer = document.getElementById('messages');
const userListDiv = document.getElementById('user-list');
const userCount = document.getElementById('user-count');
const typingIndicator = document.getElementById('typing-indicator');
const msgInput = document.getElementById('input');

let typingTimeout;

function entrar() {
    const name = document.getElementById('username').value;
    const avatar = document.getElementById('avatar').value || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
    if(name) {
        socket.emit('join', { name, avatar });
        loginDiv.classList.add('hidden');
    }
}

// Digitando...
msgInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', false), 2000);
});

socket.on('displayTyping', (data) => {
    typingIndicator.innerText = data.typing ? `${data.name} está digitando...` : '';
});

// Lista de usuários com visual melhorado
socket.on('updateUserList', (users) => {
    userCount.innerText = users.length;
    userListDiv.innerHTML = users.map(u => `
        <div class="flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition group">
            <div class="relative">
                <img src="${u.avatar}" class="w-12 h-12 rounded-2xl object-cover border border-slate-700">
                <div class="w-3 h-3 bg-green-500 rounded-full absolute -bottom-1 -right-1 border-2 border-slate-800"></div>
            </div>
            <span class="font-medium text-slate-200 group-hover:text-indigo-400 transition">${u.name}</span>
        </div>
    `).join('');
});

document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    if (msgInput.value) {
        socket.emit('chatMessage', msgInput.value);
        msgInput.value = '';
    }
};

socket.on('message', (data) => {
    const isMe = data.id === socket.id;
    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full`;
    
    div.innerHTML = `
        <div class="flex gap-4 max-w-[80%] ${isMe ? 'flex-row-reverse' : 'flex-row'}">
            <img src="${data.avatar}" class="w-12 h-12 rounded-2xl shadow-lg flex-shrink-0 border-2 border-slate-800">
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-sm font-bold text-slate-300">${data.name}</span>
                    <span class="text-[10px] text-slate-500">${data.time}</span>
                </div>
                <div class="p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none'}">
                    ${data.text}
                </div>
            </div>
        </div>
    `;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});