const socket = io();
const loginDiv = document.getElementById('login');
const msgContainer = document.getElementById('messages');
const userListDiv = document.getElementById('user-list');
const userCount = document.getElementById('user-count');
const typingIndicator = document.getElementById('typing-indicator');
const msgInput = document.getElementById('input');

let typingTimeout;

function entrar() {
    const name = document.getElementById('username').value.trim();
    const avatar = document.getElementById('avatar').value.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
    
    if(name) {
        socket.emit('join', { name, avatar });
        loginDiv.classList.add('hidden');
    } else {
        alert("Digite seu nome!");
    }
}

// Abrir prompt para enviar URL de foto
function enviarFoto() {
    const url = prompt("Cole o link da imagem (JPG, PNG, GIF):");
    if (url && url.trim() !== "") {
        socket.emit('chatMessage', url.trim());
    }
}

// Notificação de Digitando
msgInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', false), 2000);
});

socket.on('displayTyping', (data) => {
    typingIndicator.innerText = data.typing ? `${data.name} está digitando...` : '';
});

// Atualiza Lista de Usuários Lateral
socket.on('updateUserList', (users) => {
    userCount.innerText = users.length;
    userListDiv.innerHTML = users.map(u => `
        <div class="flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition group">
            <div class="relative">
                <img src="${u.avatar}" class="w-12 h-12 rounded-2xl object-cover border border-slate-700 shadow-md">
                <div class="w-3 h-3 bg-green-500 rounded-full absolute -bottom-1 -right-1 border-2 border-slate-800"></div>
            </div>
            <span class="font-medium text-slate-200 group-hover:text-indigo-400 transition truncate">${u.name}</span>
        </div>
    `).join('');
});

// Enviar Mensagem via Form
document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    if (msgInput.value.trim() !== "") {
        socket.emit('chatMessage', msgInput.value);
        msgInput.value = '';
        socket.emit('typing', false);
    }
};

// Receber Mensagem (Texto ou Imagem)
socket.on('message', (data) => {
    const isMe = data.id === socket.id;
    const isImage = data.text.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null || data.text.includes('images.unsplash.com');

    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full animate-fade-in mb-4`;
    
    const messageContent = isImage 
        ? `<img src="${data.text}" class="rounded-xl max-w-full h-auto mt-2 border border-slate-700 shadow-md cursor-pointer hover:opacity-90 transition" onclick="window.open('${data.text}', '_blank')">`
        : `<p class="text-sm leading-relaxed">${data.text}</p>`;

    div.innerHTML = `
        <div class="flex gap-4 max-w-[80%] ${isMe ? 'flex-row-reverse' : 'flex-row'}">
            <img src="${data.avatar}" class="w-12 h-12 rounded-2xl shadow-lg flex-shrink-0 border-2 border-slate-800 object-cover">
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <div class="flex items-center gap-2 mb-1 px-1">
                    <span class="text-xs font-bold text-slate-400">${isMe ? 'Você' : data.name}</span>
                    <span class="text-[9px] text-slate-600">${data.time}</span>
                </div>
                <div class="p-4 rounded-2xl shadow-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none'} border border-white/5">
                    ${messageContent}
                </div>
            </div>
        </div>
    `;
    
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});