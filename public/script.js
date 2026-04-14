const socket = io();

// Selecionando elementos do DOM
const loginDiv = document.getElementById('login');
const msgContainer = document.getElementById('messages');
const chatForm = document.getElementById('form');
const msgInput = document.getElementById('input');

// Função para entrar no chat
function entrar() {
    const nameInput = document.getElementById('username');
    const avatarInput = document.getElementById('avatar');
    
    const name = nameInput.value.trim();
    // Se não colocar foto, gera uma automática baseada no nome
    const avatar = avatarInput.value.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
    
    if (name !== "") {
        socket.emit('join', { name, avatar });
        loginDiv.classList.add('hidden'); // Esconde a tela de login
    } else {
        alert("Por favor, digite seu nome!");
    }
}

// Enviar mensagem ao submeter o formulário
chatForm.onsubmit = (e) => {
    e.preventDefault();
    if (msgInput.value.trim() !== "") {
        socket.emit('chatMessage', msgInput.value);
        msgInput.value = '';
        msgInput.focus();
    }
};

// Receber e mostrar mensagem na tela
socket.on('message', (data) => {
    const isMe = data.id === socket.id;
    const div = document.createElement('div');
    
    // Estilização das bolhas de mensagem
    div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-bounce-short`;
    
    div.innerHTML = `
        <div class="flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}">
            <img src="${data.avatar}" class="w-6 h-6 rounded-full border border-emerald-500">
            <span class="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">${isMe ? 'Você' : data.name}</span>
        </div>
        <div class="p-3 rounded-2xl shadow-lg max-w-[85%] ${isMe ? 'bg-[#005c4b] rounded-tr-none' : 'bg-[#202c33] rounded-tl-none'}">
            <p class="text-sm leading-relaxed">${data.text}</p>
            <span class="text-[9px] text-gray-400 block text-right mt-1 opacity-70">${data.time}</span>
        </div>
    `;
    
    msgContainer.appendChild(div);
    
    // Scroll automático para o final
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

// Adiciona suporte para enviar com a tecla "Enter" sem precisar do botão
msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        chatForm.dispatchEvent(new Event('submit'));
    }
});