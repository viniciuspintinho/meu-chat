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
    document.getElementById('user-level').innerText = userLevel;
    document.getElementById('user-xp').innerText = userXP;
    document.getElementById('xp-fill').style.width = (userXP / 100 * 100) + "%";
}

function gainXP() {
    userXP += Math.floor(Math.random() * 10) + 5;
    if (userXP >= 100) {
        userLevel++;
        userXP = 0;
        alert(`⭐ LEVEL UP! Você agora é Nível ${userLevel}!`);
    }
    localStorage.setItem('chat_xp', userXP);
    localStorage.setItem('chat_level', userLevel);
    updateXPUI();
}

window.onload = () => {
    const sessionUser = sessionStorage.getItem('chat_user');
    applyTheme(localStorage.getItem('chat_theme_color') || '#0095f6');
    updateXPUI();
    if (sessionUser) {
        socket.emit('join', JSON.parse(sessionUser));
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
        document.getElementById('login').classList.add('hidden');
    }
}

function processCommand(val) {
    const user = JSON.parse(sessionStorage.getItem('chat_user'));
    const args = val.split(' ');
    const cmd = args[0].toLowerCase();
    const target = args.slice(1).join(' ');
    let res = { text: "", type: "normal" };

    if(cmd === '/love') res.text = `❤️ Amor entre **${user.name}** e **${target}**: ${Math.floor(Math.random()*101)}%`;
    else if(cmd === '/bater') res.text = `👊 **${user.name}** bateu em **${target}**!`;
    else if(cmd === '/abrace') res.text = `🫂 **${user.name}** abraçou **${target}**!`;
    else if(cmd === '/moeda') res.text = `🪙 Deu **${Math.random() > 0.5 ? "CARA" : "COROA"}**!`;
    else if(cmd === '/dado') res.text = `🎲 Tirou **${Math.floor(Math.random()*6)+1}**!`;
    else if(cmd === '/aviso' && user.name === ADMIN_NAME) res.text = `⚠️ **AVISO:** ${target}`;
    else if(cmd === '/letreiro') { res.text = target; res.type = "letreiro"; }
    else return val;
    return res;
}

document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    const val = msgInput.value.trim();
    if(!val) return;
    const cmd = processCommand(val);
    const payload = typeof cmd === 'object' ? { text: cmd.text, msgType: cmd.type, replyTo: selectedReply } : { text: val, replyTo: selectedReply };
    socket.emit('chatMessage', payload);
    gainXP(); // Ganhando XP ao enviar
    msgInput.value = '';
    cancelReply();
};

socket.on('message', (data) => {
    const isMe = data.id === socket.id;
    const userData = JSON.parse(sessionStorage.getItem('chat_user') || "{}");
    const isSequencial = (data.id === lastSenderId);
    lastSenderId = data.id;

    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full ${isSequencial ? 'mt-0.5' : 'mt-4'}`;

    let bubbleStyle = isMe ? 'bubble-me rounded-2xl' : 'bg-white/10 rounded-2xl border border-white/5 backdrop-blur-sm';
    if(isMe && !isSequencial) bubbleStyle += ' rounded-br-none bubble-glow';
    if(!isMe && !isSequencial) bubbleStyle += ' rounded-bl-none';

    let txt = data.text.replace(/@(\w+)/g, '<span class="text-blue-400 font-bold">@$1</span>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    let content = data.text.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? `<img src="${data.text}" class="max-w-xs rounded-lg">` : `<p class="text-sm">${txt}</p>`;
    if(data.msgType === "letreiro") content = `<div class="letreiro-msg">${data.text}</div>`;

    div.innerHTML = `
        <div class="flex gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : ''} items-end group">
            ${isSequencial ? '<div class="w-8"></div>' : `<img src="${data.avatar}" class="w-8 h-8 rounded-full">`}
            <div class="flex flex-col ${isMe ? 'items-end' : ''}">
                ${isSequencial ? '' : `<span class="text-[10px] text-gray-500 mb-0.5 ${data.name === ADMIN_NAME ? 'adm-name' : ''}">${data.name}</span>`}
                <div class="px-4 py-2 ${bubbleStyle} relative">
                    ${data.replyTo ? `<div class="text-[9px] opacity-60 border-l-2 pl-2 mb-1"><b>${data.replyTo.name}</b>: ${data.replyTo.text}</div>` : ''}
                    ${content}
                    <button onclick="setReply('${data.name}', '${data.text.replace(/'/g, "\\'")}')" class="absolute -bottom-4 ${isMe?'right-0':'left-0'} text-[8px] text-gray-500 opacity-0 group-hover:opacity-100 transition">RESPONDER</button>
                </div>
            </div>
        </div>`;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

socket.on('updateUserList', (users) => {
    document.getElementById('user-list').innerHTML = users.map(u => `
        <div class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition">
            <img src="${u.avatar}" class="w-8 h-8 rounded-full">
            <span class="text-xs ${u.name === ADMIN_NAME ? 'adm-name' : 'text-gray-300'}">${u.name}</span>
        </div>`).join('');
    const limit = 4;
    facepileDiv.innerHTML = users.slice(0, limit).map((u, i) => `<img src="${u.avatar}" class="face-item" style="z-index: ${10 - i}">`).join('') + (users.length > limit ? `<div class="face-more">+${users.length - limit}</div>` : '');
});

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
function changeTheme(hex) { applyTheme(hex); document.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active')); event.target.classList.add('active'); }
function logout() { sessionStorage.removeItem('chat_user'); window.location.reload(); }
function setReply(name, text) { 
    selectedReply = { name, text }; 
    document.getElementById('reply-user').innerText = name;
    document.getElementById('reply-text').innerText = text;
    document.getElementById('reply-container').classList.remove('hidden');
}
function cancelReply() { selectedReply = null; document.getElementById('reply-container').classList.add('hidden'); }
function enviarFoto() { const url = prompt("Link da foto:"); if(url) socket.emit('chatMessage', { text: url, replyTo: selectedReply }); }