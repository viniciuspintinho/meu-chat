const socket = io();
const msgContainer = document.getElementById('messages');
const msgInput = document.getElementById('input');
const facepileDiv = document.getElementById('facepile');

// Lista de admins
const ADMINS = ["vn7", "pl"];

let selectedReply = null;
let lastSenderId = null;
let typingTimeout;

let userXP = parseInt(localStorage.getItem('chat_xp')) || 0;
let userLevel = parseInt(localStorage.getItem('chat_level')) || 1;

// --- FUNCIONALIDADE: Som de Notificação ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playNotificationSound() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); 
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
}

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

// --- DESIGN: GainXP com Pop-up ---
function gainXP(amount = null) {
    userXP += (amount !== null) ? amount : (Math.floor(Math.random() * 10) + 5);
    while (userXP >= 100) { userLevel++; userXP -= 100; }
    localStorage.setItem('chat_xp', userXP);
    localStorage.setItem('chat_level', userLevel);
    updateXPUI();

    const container = document.getElementById('xp-popup-container');
    if(container) {
        const popup = document.createElement('span');
        popup.className = 'xp-popup';
        popup.innerText = '+XP';
        container.appendChild(popup);
        setTimeout(() => popup.remove(), 1000);
    }
}

window.onload = () => {
    const sessionUser = sessionStorage.getItem('chat_user');
    applyTheme(localStorage.getItem('chat_theme_color') || '#0095f6');
    updateXPUI();
    if (sessionUser) {
        const user = JSON.parse(sessionUser);
        socket.emit('join', user);
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
        if(document.getElementById('my-avatar')) document.getElementById('my-avatar').src = avatar;
        if(document.getElementById('my-name')) document.getElementById('my-name').innerText = name;
        document.getElementById('login').classList.add('hidden');
    }
}

socket.on('forceDisconnect', (msg) => {
    alert(msg);
    sessionStorage.removeItem('chat_user');
    window.location.reload();
});

socket.on('displayTyping', (data) => {
    const typingDiv = document.getElementById('typing-indicator');
    typingDiv.innerText = data.typing ? `${data.name} está digitando...` : '';
});

// --- FUNCIONALIDADE: Novos Comandos ---
function processCommand(val) {
    const user = JSON.parse(sessionStorage.getItem('chat_user'));
    const args = val.split(' ');
    const cmd = args[0].toLowerCase();
    const target = args.slice(1).join(' ');
    const isAdm = ADMINS.includes(user.name);
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
    else if(cmd === '/jokenpo') {
        const op = ["Pedra 🪨", "Papel 📄", "Tesoura ✂️"];
        res.text = `🎮 **${user.name}** jogou **${op[Math.floor(Math.random()*3)]}**!`;
    }
    else if(cmd === '/festa') {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#0095f6', '#7c3aed', '#ffffff'] });
        res.text = `🎉 **${user.name}** iniciou uma festa!`;
    }
    else if(cmd === '/shrug') {
        res.text = "¯\\_(ツ)_/¯";
    }
    else if(cmd === '/limpar' && isAdm) { msgContainer.innerHTML = ''; res.silent = true; }
    else if(cmd === '/aviso' && isAdm) res.text = `⚠️ **AVISO:** ${target}`;
    else if(cmd === '/letreiro') { res.text = target; res.type = "letreiro"; }
    else return val;
    return res;
}

msgInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', false), 2000);
});

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
    socket.emit('typing', false);
};

socket.on('message', (data) => {
    const isMe = data.id === socket.id;
    const isSequencial = (data.id === lastSenderId);
    lastSenderId = data.id;

    const div = document.createElement('div');
    // DESIGN: Adição de message-animate
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full ${isSequencial ? 'mt-0.5' : 'mt-4'} message-animate`;

    // DESIGN: Mensagem de Sistema/Bot
    if(data.id === "bot" || data.name === "SISTEMA" || data.name === "Lux Bot") {
        div.innerHTML = `<div class="system-msg">${data.text}</div>`;
        msgContainer.appendChild(div);
        msgContainer.scrollTop = msgContainer.scrollHeight;
        return;
    }

    // FUNCIONALIDADE: Som de menção
    const myUser = JSON.parse(sessionStorage.getItem('chat_user'));
    if(myUser && data.text.includes(`@${myUser.name}`)) playNotificationSound();

    const isAdminMsg = ADMINS.includes(data.name);
    let bubbleStyle = isMe ? 'bubble-me rounded-2xl' : 'bg-white/5 rounded-2xl';
    // DESIGN: Adição de admin-glow
    if(isAdminMsg) bubbleStyle += ' admin-glow';
    
    const nameColor = isAdminMsg ? '' : 'rgba(255,255,255,0.7)';
    const nameClass = isAdminMsg ? 'msg-author-name admin-name-highlight' : 'msg-author-name';

    let txt = data.text.replace(/@(\w+)/g, '<span class="text-blue-400 font-bold">@$1</span>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    let messageContent = data.text.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? `<img src="${data.text}" class="max-w-xs rounded-lg shadow-xl">` : `<p class="message-text">${txt}</p>`;
    
    if(data.msgType === "letreiro") {
        messageContent = `<div class="letreiro-msg">${data.text}</div>`;
    }

    let replyVisual = "";
    if (data.replyTo) {
        replyVisual = `
            <div class="bg-black/20 border-l-2 border-white/30 p-2 mb-2 rounded text-[10px] opacity-80 italic">
                <b class="block text-white/50">${data.replyTo.name}</b>
                <span class="truncate block">${data.replyTo.text}</span>
            </div>
        `;
    }

    let authorityHeader = '';
    if (isAdminMsg) {
        authorityHeader = `
            <div class="msg-header-autoridade">
                <span class="admin-icon">👑</span>
                <span class="badge-authority badge-adm">ADM</span>
                <span class="${nameClass}" style="color: ${nameColor}">${data.name}</span>
            </div>
        `;
    } else {
        authorityHeader = `<span class="${nameClass}" style="color: ${nameColor}">${data.name}</span>`;
    }

    div.innerHTML = `
        <div class="max-w-[80%] ${bubbleStyle} p-3 relative group shadow-deep-glow cursor-pointer" onclick="setReply('${data.name}', '${data.text.replace(/'/g, "\\'")}')">
            ${!isSequencial ? authorityHeader : ''}
            ${replyVisual}
            <div class="text-white/95 leading-relaxed text-sm">
                ${messageContent}
            </div>
        </div>
    `;

    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

socket.on('updateUserList', (users) => {
    const userListElement = document.getElementById('user-list');
    if(userListElement) {
        userListElement.innerHTML = users.map(u => `
            <div class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition">
                <img src="${u.avatar}" class="w-8 h-8 rounded-full border border-white/10 object-cover">
                <span class="text-xs tracking-tight ${ADMINS.includes(u.name) ? 'text-yellow-400 font-bold' : 'text-gray-400 font-medium'}">${u.name}</span>
            </div>`).join('');
    }
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
    if(name) { sessionStorage.setItem('chat_user', JSON.stringify({ name, avatar })); window.location.reload(); }
}

function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }
function changeTheme(hex) { applyTheme(hex); }
function logout() { sessionStorage.removeItem('chat_user'); window.location.reload(); }

function setReply(name, text) { 
    selectedReply = { name, text }; 
    document.getElementById('reply-user').innerText = name; 
    document.getElementById('reply-text').innerText = text; 
    document.getElementById('reply-container').classList.remove('hidden'); 
    msgInput.focus();
}

function cancelReply() { 
    selectedReply = null; 
    document.getElementById('reply-container').classList.add('hidden'); 
}

// COLE NO FINAL DO script.js

// =========================
// GARTIC CLIENT
// =========================

const garticBox = document.getElementById("gartic-box");
const canvas = document.getElementById("garticCanvas");
const clearBtn = document.getElementById("clearBtn");
const rankingDiv = document.getElementById("ranking");
const garticInfo = document.getElementById("garticInfo");

const ctx = canvas.getContext("2d");

let desenhando = false;
let podeDesenhar = false;

function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = 350;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

ctx.lineWidth = 4;
ctx.lineCap = "round";
ctx.strokeStyle = "#111";

function startDraw(e) {
    if (!podeDesenhar) return;
    desenhando = true;
    draw(e);
}

function endDraw() {
    desenhando = false;
    ctx.beginPath();
}

function draw(e) {
    if (!desenhando || !podeDesenhar) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);

    socket.emit("draw", { x, y });
}

canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mouseup", endDraw);
canvas.addEventListener("mouseleave", endDraw);
canvas.addEventListener("mousemove", draw);

// mobile
canvas.addEventListener("touchstart", (e) => {
    startDraw(e.touches[0]);
});
canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    draw(e.touches[0]);
});
canvas.addEventListener("touchend", endDraw);

clearBtn.onclick = () => socket.emit("clearMyCanvas");

socket.on("draw", (data) => {
    ctx.lineTo(data.x, data.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(data.x, data.y);
});

socket.on("clearCanvas", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on("garticStatus", (data) => {
    garticBox.classList.remove("hidden");
    garticInfo.innerText = `🎨 ${data.desenhista} está desenhando`;
    podeDesenhar = false;
});

socket.on("garticPalavra", (palavra) => {
    garticBox.classList.remove("hidden");
    garticInfo.innerText = `✏️ Sua palavra: ${palavra}`;
    podeDesenhar = true;
});

socket.on("garticRanking", (ranking) => {
    rankingDiv.innerHTML = Object.entries(ranking)
        .map(([nome, pts]) => `🏆 ${nome}: ${pts} pts`)
        .join("<br>");
});

function enviarFoto() { const url = prompt("Link da foto:"); if(url) socket.emit('chatMessage', { text: url, replyTo: selectedReply }); }