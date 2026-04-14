const socket = io();
const msgContainer = document.getElementById('messages');
const msgInput = document.getElementById('input');
const facepileDiv = document.getElementById('facepile');
const ADMIN_NAME = "vn7";

let selectedReply = null;
let lastSenderId = null;

// Lógica de XP
let userXP = parseInt(localStorage.getItem('chat_xp')) || 0;
let userLevel = parseInt(localStorage.getItem('chat_level')) || 1;

function applyTheme(hex) {
    if(!hex) return;
    document.documentElement.style.setProperty('--theme-color', hex);
    localStorage.setItem('chat_theme_color', hex);
}

function updateXPUI() {
    if(document.getElementById('user-level')) {
        document.getElementById('user-level').innerText = userLevel;
        document.getElementById('user-xp').innerText = userXP;
        document.getElementById('xp-fill').style.width = (Math.min(userXP, 100)) + "%";
    }
}

function gainXP(amount = null) {
    userXP += (amount !== null) ? amount : (Math.floor(Math.random() * 10) + 5);
    while (userXP >= 100) {
        userLevel++;
        userXP -= 100;
    }
    localStorage.setItem('chat_xp', userXP);
    localStorage.setItem('chat_level', userLevel);
    updateXPUI();
}

// Atualizado para os novos selos de autoridade estilizados no CSS
function getBadges(name) {
    if (name === ADMIN_NAME) {
        return `
            <span class="badge-authority badge-creator">CRIADOR</span>
            <span class="badge-authority badge-adm">ADM</span>
        `;
    }
    return '';
}

window.onload = () => {
    const sessionUser = sessionStorage.getItem('chat_user');
    applyTheme(localStorage.getItem('chat_theme_color') || '#0095f6');
    updateXPUI();
    if (sessionUser) {
        const user = JSON.parse(sessionUser);
        socket.emit('join', user);
        
        // Atualiza o perfil circular na sidebar
        if(document.getElementById('my-avatar')) document.getElementById('my-avatar').src = user.avatar;
        if(document.getElementById('my-name')) document.getElementById('my-name').innerText = user.name;
        
        document.getElementById('login').classList.add('hidden');
    }
};

function entrar() {
    const name = document.getElementById('username').value.trim();
    const avatar = document.getElementById('avatar').value.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
    if(name) {
        const userData = { name, avatar };
        sessionStorage.setItem('chat_user', JSON.stringify(userData));
        socket.emit('join', userData);
        
        // Atualiza a sidebar na entrada
        if(document.getElementById('my-avatar')) document.getElementById('my-avatar').src = avatar;
        if(document.getElementById('my-name')) document.getElementById('my-name').innerText = name;
        
        document.getElementById('login').classList.add('hidden');
    }
}

function processCommand(val) {
    const user = JSON.parse(sessionStorage.getItem('chat_user'));
    const args = val.split(' ');
    const cmd = args[0].toLowerCase();
    const target = args.slice(1).join(' ');
    const isAdm = user.name === ADMIN_NAME;

    let res = { text: "", type: "normal", silent: false };

    if(cmd === '/setxp' && isAdm) {
        const amount = parseInt(args[1]);
        if(!isNaN(amount)) { gainXP(amount); res.silent = true; }
    }
    else if(cmd === '/love') res.text = `❤️ Amor entre **${user.name}** e **${target}**: ${Math.floor(Math.random()*101)}%`;
    else if(cmd === '/bater') res.text = `👊 **${user.name}** bateu em **${target}**!`;
    else if(cmd === '/abrace') res.text = `🫂 **${user.name}** abraçou **${target}**!`;
    else if(cmd === '/moeda') res.text = `🪙 Deu **${Math.random() > 0.5 ? "CARA" : "COROA"}**!`;
    else if(cmd === '/dado') res.text = `🎲 Tirou **${Math.floor(Math.random()*6)+1}**!`;
    else if(cmd === '/aviso' && isAdm) res.text = `⚠️ **AVISO:** ${target}`;
    else if(cmd === '/letreiro') { res.text = target; res.type = "letreiro"; }
    else return val;
    return res;
}

document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    const val = msgInput.value.trim();
    if(!val) return;
    const cmdResult = processCommand(val);
    if(cmdResult.silent) { msgInput.value = ''; return; }
    const payload = typeof cmdResult === 'object' ? { text: cmdResult.text, msgType: cmdResult.type, replyTo: selectedReply } : { text: val, replyTo: selectedReply };
    socket.emit('chatMessage', payload);
    gainXP(); 
    msgInput.value = '';
    cancelReply();
};

// --- RECEBIMENTO DE MENSAGENS ---
socket.on('message', (data) => {
    const isMe = data.id === socket.id;
    const isSequencial = (data.id === lastSenderId);
    lastSenderId = data.id;

    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full ${isSequencial ? 'mt-0.5' : 'mt-4'}`;

    // Estilização dos balões: Mais transparente e legível (Glassmorphism)
    let bubbleStyle = isMe ? 'bubble-me rounded-2xl' : 'bg-white/5 rounded-2xl border border-white/5 backdrop-blur-md';
    if(isMe && !isSequencial) bubbleStyle += ' rounded-br-none bubble-glow';
    if(!isMe && !isSequencial) bubbleStyle += ' rounded-bl-none';

    let txt = data.text.replace(/@(\w+)/g, '<span class="text-blue-400 font-bold">@$1</span>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    let content = data.text.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? `<img src="${data.text}" class="max-w-xs rounded-lg shadow-xl">` : `<p class="text-sm font-medium tracking-wide">${txt}</p>`;
    
    if(data.msgType === "letreiro") {
        content = `<div class="letreiro-msg">${data.text}</div>`;
    }

    const admBadges = getBadges(data.name);
    // Estilo diferenciado para o nome do ADM no chat
    const nameStyle = data.name === ADMIN_NAME ? 'color: #FFD700; font-weight: 800;' : 'color: rgba(255,255,255,0.5); font-weight: 600;';

    div.innerHTML = `
        <div class="max-w-[80%] ${bubbleStyle} p-3 relative group" style="background-color: ${isMe ? 'rgba(0, 149, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)'};">
            ${!isSequencial ? `<div class="flex items-center gap-1.5 mb-1.5">
                <span class="text-[10px] uppercase tracking-wider" style="${nameStyle}">${data.name}</span>
                ${admBadges}
            </div>` : ''}
            <div class="message-text-wrapper text-white">
                ${content}
            </div>
            <button onclick="setReply('${data.name}', '${data.text}')" class="absolute top-0 -left-8 opacity-0 group-hover:opacity-100 transition">💬</button>
        </div>
    `;

    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

// --- LISTA DE USUÁRIOS E FACEPILE ---
socket.on('updateUserList', (users) => {
    const userListElement = document.getElementById('user-list');
    if(userListElement) {
        userListElement.innerHTML = users.map(u => `
            <div class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition">
                <img src="${u.avatar}" class="w-8 h-8 rounded-full border border-white/10 object-cover">
                <span class="text-xs tracking-tight ${u.name === ADMIN_NAME ? 'text-yellow-400 font-bold' : 'text-gray-400 font-medium'}">${u.name}</span>
            </div>`).join('');
    }

    const limit = 4;
    facepileDiv.innerHTML = users.slice(0, limit).map((u, i) => 
        `<img src="${u.avatar}" class="face-item" style="z-index: ${10 - i}; position: relative;">`
    ).join('') + (users.length > limit ? `<div class="face-more">+${users.length - limit}</div>` : '');
});

// --- CONFIGURAÇÕES E UTILITÁRIOS ---
function openSettings() {
    const user = JSON.parse(sessionStorage.getItem('chat_user') || "{}");
    document.getElementById('set-username').value = user.name || "";
    document.getElementById('set-avatar').value = user.avatar || "";
    document.getElementById('settings-modal').classList.remove('hidden');
}

function saveSettings() {
    const name = document.getElementById('set-username').value.trim();
    const avatar = document.getElementById('set-avatar').value.trim();
    if(name) { 
        sessionStorage.setItem('chat_user', JSON.stringify({ name, avatar })); 
        window.location.reload(); 
    }
}

function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }

function changeTheme(hex) { 
    applyTheme(hex); 
    document.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active')); 
    if(window.event) window.event.target.classList.add('active'); 
}

function logout() { sessionStorage.removeItem('chat_user'); window.location.reload(); }

function setReply(name, text) { 
    selectedReply = { name, text }; 
    document.getElementById('reply-user').innerText = name;
    document.getElementById('reply-text').innerText = text;
    document.getElementById('reply-container').classList.remove('hidden');
}

function cancelReply() { 
    selectedReply = null; 
    document.getElementById('reply-container').classList.add('hidden'); 
}

function enviarFoto() { 
    const url = prompt("Link da foto:"); 
    if(url) socket.emit('chatMessage', { text: url, replyTo: selectedReply }); 
}