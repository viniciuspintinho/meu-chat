const socket = io();
const msgContainer = document.getElementById('messages');
const msgInput = document.getElementById('input');
const garticChatContainer = document.getElementById('gartic-chat-messages');
const garticInput = document.getElementById('gartic-input');

// Lista de admins
const ADMINS = ["vn7", "pl"];

let selectedReply = null;
let lastSenderId = null;
let typingTimeout;

let userXP = parseInt(localStorage.getItem('chat_xp')) || 0;
let userLevel = parseInt(localStorage.getItem('chat_level')) || 1;

// =========================
// PREVIEW DE LINKS AUTOMÁTICO
// =========================
function generatePreview(text) {
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const imgRegex = /\.(jpeg|jpg|gif|png|webp)$/i;

    if (youtubeRegex.test(text)) {
        const id = text.match(youtubeRegex)[1];
        return `<div class="mt-2 rounded-lg overflow-hidden border border-white/10">
                    <iframe width="100%" height="180" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>
                </div>`;
    }
    
    if (imgRegex.test(text)) {
        return `<img src="${text}" class="max-w-full mt-2 rounded-lg shadow-xl border border-white/10">`;
    }
    
    let txt = text.replace(/@(\w+)/g, '<span class="text-blue-400 font-bold">@$1</span>')
                  .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    return `<p>${txt}</p>`;
}

// =========================
// SOM
// =========================
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

// =========================
// TEMA
// =========================
function applyTheme(hex) {
    if (!hex) return;

    document.documentElement.style.setProperty('--theme-color', hex);
    localStorage.setItem('chat_theme_color', hex);
}

// =========================
// XP
// =========================
function updateXPUI() {
    const lvl = document.getElementById('user-level');
    const xp = document.getElementById('user-xp');
    const fill = document.getElementById('xp-fill');

    if (!lvl) return;

    lvl.innerText = userLevel;
    xp.innerText = userXP;
    fill.style.width = Math.min(userXP, 100) + "%";
}

function gainXP(amount = null) {
    userXP += amount !== null ? amount : Math.floor(Math.random() * 10) + 5;

    while (userXP >= 100) {
        userLevel++;
        userXP -= 100;
    }

    localStorage.setItem('chat_xp', userXP);
    localStorage.setItem('chat_level', userLevel);

    updateXPUI();

    const container = document.getElementById('xp-popup-container');

    if (container) {
        const popup = document.createElement('span');
        popup.className = 'xp-popup';
        popup.innerText = '+XP';
        container.appendChild(popup);

        setTimeout(() => popup.remove(), 1000);
    }
}

// =========================
// LOGIN AUTO
// =========================
window.onload = () => {
    const sessionUser = sessionStorage.getItem('chat_user');

    applyTheme(localStorage.getItem('chat_theme_color') || '#0095f6');
    updateXPUI();

    if (sessionUser) {
        const user = JSON.parse(sessionUser);

        socket.emit('join', user);

        document.getElementById('my-avatar').src = user.avatar;
        document.getElementById('my-name').innerText = user.name;
        document.getElementById('login').classList.add('hidden');
    }
};

// =========================
// ENTRAR
// =========================
function entrar() {
    const name = document.getElementById('username').value.trim();

    const avatar =
        document.getElementById('avatar').value.trim() ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;

    if (!name) return;

    const userData = { name, avatar };

    sessionStorage.setItem('chat_user', JSON.stringify(userData));
    socket.emit('join', userData);

    document.getElementById('my-avatar').src = avatar;
    document.getElementById('my-name').innerText = name;
    document.getElementById('login').classList.add('hidden');
}

// =========================
// FORCE DISCONNECT
// =========================
socket.on('forceDisconnect', (msg) => {
    alert(msg);
    sessionStorage.removeItem('chat_user');
    window.location.reload();
});

// =========================
// SHOUT COMMAND
// =========================
socket.on('shout', (data) => {
    const overlay = document.getElementById('shout-overlay');
    const author = document.getElementById('shout-author');
    const text = document.getElementById('shout-text');
    
    author.innerText = `AVISO IMPORTANTE DE ${data.name}`;
    text.innerText = data.text;
    overlay.style.display = 'flex';
    
    playNotificationSound();
    
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 6000);
});

// =========================
// TYPING
// =========================
socket.on('displayTyping', (data) => {
    document.getElementById('typing-indicator').innerText =
        data.typing ? `${data.name} está digitando...` : '';
});

msgInput.addEventListener('input', () => {
    socket.emit('typing', true);

    clearTimeout(typingTimeout);

    typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 2000);
});

// =========================
// COMANDOS
// =========================
function processCommand(val) {
    const user = JSON.parse(sessionStorage.getItem('chat_user'));
    const args = val.split(' ');
    const cmd = args[0].toLowerCase();
    const target = args.slice(1).join(' ');
    const isAdm = ADMINS.includes(user.name);

    let res = {
        text: "",
        type: "normal",
        silent: false
    };

    if (cmd === '/setxp' && isAdm) {
        const amount = parseInt(args[1]);
        if (!isNaN(amount)) {
            gainXP(amount);
            res.silent = true;
        }
    }

    else if (cmd === '/love')
        res.text = `❤️ Amor entre **${user.name}** e **${target}**: ${Math.floor(Math.random() * 101)}%`;

    else if (cmd === '/bater')
        res.text = `👊 **${user.name}** bateu em **${target}**!`;

    else if (cmd === '/abrace')
        res.text = `🫂 **${user.name}** abraçou **${target}**!`;

    else if (cmd === '/moeda')
        res.text = `🪙 Deu **${Math.random() > 0.5 ? 'CARA' : 'COROA'}**!`;

    else if (cmd === '/dado')
        res.text = `🎲 Tirou **${Math.floor(Math.random() * 6) + 1}**!`;

    else if (cmd === '/jokenpo') {
        const op = ['Pedra 🪨', 'Papel 📄', 'Tesoura ✂️'];
        res.text = `🎮 **${user.name}** jogou **${op[Math.floor(Math.random() * 3)]}**!`;
    }

    else if (cmd === '/festa') {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 }
        });

        res.text = `🎉 **${user.name}** iniciou uma festa!`;
    }

    else if (cmd === '/shrug')
        res.text = "¯\\_(ツ)_/¯";

    else if (cmd === '/limpar' && isAdm) {
        msgContainer.innerHTML = '';
        res.silent = true;
    }

    else if (cmd === '/aviso' && isAdm)
        res.text = `⚠️ **AVISO:** ${target}`;

    else if (cmd === '/letreiro') {
        res.text = target;
        res.type = "letreiro";
    }

    else return val;

    return res;
}

// =========================
// ENVIAR MSG (CHAT NORMAL)
// =========================
document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();

    const val = msgInput.value.trim();
    if (!val) return;

    const cmdResult = processCommand(val);

    if (cmdResult.silent) {
        msgInput.value = '';
        return;
    }

    const payload =
        typeof cmdResult === 'object'
            ? {
                text: cmdResult.text,
                msgType: cmdResult.type,
                replyTo: selectedReply
            }
            : {
                text: val,
                replyTo: selectedReply
            };

    socket.emit('chatMessage', payload);

    gainXP();

    msgInput.value = '';
    cancelReply();

    socket.emit('typing', false);
};

// =========================
// ENVIAR PALPITE (GARTIC)
// =========================
garticInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const val = garticInput.value.trim();
        if (!val) return;
        
        socket.emit('chatMessage', {
            text: val,
            msgType: "gartic-guess" 
        });
        
        garticInput.value = '';
    }
});

// =========================
// RECEBER MSG (ATUALIZADO PARA SEPARAR GARTIC E ACERTOS)
// =========================
socket.on('message', (data) => {
    const meuUser = JSON.parse(sessionStorage.getItem('chat_user'));

    // 1. FILTRO DE ACERTO/VITÓRIA (MENSAGEM DE SUCESSO NO GARTIC)
    // Agora verifica se a mensagem vem do SISTEMA e contém "acertou"
    if (data.msgType === "gartic-success" || (data.name === "SISTEMA" && data.text.toLowerCase().includes("acertou"))) {
        const div = document.createElement('div');
        div.className = "p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-[11px] font-bold text-green-400 animate-bounce text-center mb-1";
        div.innerHTML = `✨ ${data.text}`;
        garticChatContainer.appendChild(div);
        garticChatContainer.scrollTop = garticChatContainer.scrollHeight;

        if (meuUser && data.text.includes(meuUser.name)) {
            confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
        }
        return; // Retorna para não exibir no chat principal
    }

    // 2. FILTRO GARTIC: Se for palpite normal, vai para o mini-chat lateral
    if (data.msgType === "gartic-guess") {
        const div = document.createElement('div');
        div.className = "p-2 rounded-lg bg-white/5 border border-white/5 text-xs animate-pulse";
        div.innerHTML = `<span class="font-bold text-blue-400">${data.name}:</span> ${data.text}`;
        garticChatContainer.appendChild(div);
        garticChatContainer.scrollTop = garticChatContainer.scrollHeight;
        return; 
    }

    const isMe = data.id === socket.id;
    const isSequencial = data.id === lastSenderId;

    lastSenderId = data.id;

    const div = document.createElement('div');

    div.className =
        `flex ${isMe ? 'justify-end' : 'justify-start'} w-full ${isSequencial ? 'mt-0.5' : 'mt-4'} message-animate`;

    if (
        data.id === "bot" ||
        data.name === "SISTEMA" ||
        data.name === "Lux Bot"
    ) {
        div.innerHTML = `<div class="system-msg">${data.text}</div>`;
        msgContainer.appendChild(div);
        msgContainer.scrollTop = msgContainer.scrollHeight;
        return;
    }

    if (meuUser && data.text.includes(`@${meuUser.name}`)) {
        playNotificationSound();
    }

    const isAdminMsg = ADMINS.includes(data.name);

    let bubbleStyle = isMe
        ? 'bubble-me rounded-2xl'
        : 'bg-white/5 rounded-2xl';

    if (isAdminMsg) bubbleStyle += ' admin-glow';

    const messageContent = generatePreview(data.text);

    div.innerHTML = `
        <div class="max-w-[80%] ${bubbleStyle} p-3 relative group cursor-pointer"
        onclick="setReply('${data.name}','${data.text.replace(/'/g, "\\'")}')">

            ${!isSequencial ? `<div class="font-bold mb-1 ${isAdminMsg ? 'admin-name-highlight' : ''}">${data.name}</div>` : ''}

            ${messageContent}
        </div>
    `;

    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

// =========================
// USERS ONLINE
// =========================
socket.on('updateUserList', (users) => {
    const userList = document.getElementById('user-list');

    userList.innerHTML = users.map(u => {
        const isAdm = ADMINS.includes(u.name);
        return `
            <div class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition">
                <img src="${u.avatar}" class="w-8 h-8 rounded-full object-cover ${isAdm ? 'avatar-active' : ''}">
                <span class="text-xs ${isAdm ? 'text-red-500 font-bold' : 'text-gray-400'}">
                    ${u.name}
                </span>
            </div>
        `;
    }).join('');
});

// =========================
// CONFIG
// =========================
function openSettings() {
    const user = JSON.parse(sessionStorage.getItem('chat_user') || "{}");

    document.getElementById('set-username').value = user.name || "";
    document.getElementById('set-avatar').value = user.avatar || "";

    document.getElementById('settings-modal').classList.remove('hidden');
}

function saveSettings() {
    const name = document.getElementById('set-username').value.trim();
    const avatar = document.getElementById('set-avatar').value.trim();

    if (!name) return;

    sessionStorage.setItem('chat_user', JSON.stringify({ name, avatar }));
    window.location.reload();
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
}

function changeTheme(hex) {
    applyTheme(hex);
}

function logout() {
    sessionStorage.removeItem('chat_user');
    window.location.reload();
}

// =========================
// REPLY
// =========================
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

// =========================
// FOTO
// =========================
function enviarFoto() {
    const url = prompt("Link da foto:");

    if (url) {
        socket.emit('chatMessage', {
            text: url,
            replyTo: selectedReply
        });
    }
}

// =========================
// GARTIC PRO CLIENT
// =========================

const garticBox = document.getElementById("gartic-box");
const canvas = document.getElementById("garticCanvas");
const clearBtn = document.getElementById("clearBtn");
const rankingDiv = document.getElementById("ranking");
const garticInfo = document.getElementById("garticInfo");
const colorPicker = document.getElementById("colorPicker");
const penSize = document.getElementById("penSize");

const ctx = canvas.getContext("2d");

let desenhando = false;
let podeDesenhar = false;

let lastX = 0;
let lastY = 0;

function toggleGarticView() {
    if (garticBox.classList.contains("hidden")) {
        garticBox.classList.remove("hidden");
        resizeCanvas();
        socket.emit("startGartic"); 
    } else {
        garticBox.classList.add("hidden");
    }
}

function resizeCanvas() {
    const parent = canvas.parentElement;
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
}

window.addEventListener("resize", resizeCanvas);

function getPos(e) {
    const rect = canvas.getBoundingClientRect();

    if (e.touches) {
        return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top
        };
    }

    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function renderStroke(data) {
    ctx.beginPath();
    ctx.strokeStyle = data.color || "#000000";
    ctx.lineWidth = data.size || 5;
    ctx.moveTo(data.x1, data.y1);
    ctx.lineTo(data.x2, data.y2);
    ctx.stroke();
}

function startDraw(e) {
    if (!podeDesenhar) return;

    desenhando = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
}

function draw(e) {
    if (!desenhando || !podeDesenhar) return;

    const pos = getPos(e);

    const drawData = {
        x1: lastX,
        y1: lastY,
        x2: pos.x,
        y2: pos.y,
        color: colorPicker.value,
        size: penSize.value
    };

    renderStroke(drawData);
    socket.emit("draw", drawData);

    lastX = pos.x;
    lastY = pos.y;
}

function endDraw() {
    desenhando = false;
}

socket.on("draw", (data) => {
    renderStroke(data);
});

socket.on("clearCanvas", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on("garticStatus", (data) => {
    const meuUser = JSON.parse(sessionStorage.getItem('chat_user'));
    
    if (data.desenhista !== meuUser.name) {
        podeDesenhar = false;
        garticInfo.innerText = `🎨 ${data.desenhista} está desenhando...`;
    }
});

socket.on("garticRanking", (points) => {
    rankingDiv.innerHTML = Object.entries(points)
        .map(([nome, pts]) => `🏆 ${nome}: ${pts} pts`)
        .join(" | ");
});

socket.on("garticPalavra", (palavra) => {
    garticInfo.innerText = `Sua palavra é: ${palavra}`;
    podeDesenhar = true;
});

clearBtn.onclick = () => {
    socket.emit("clearMyCanvas");
};

canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", endDraw);
canvas.addEventListener("mouseleave", endDraw);

canvas.addEventListener("touchstart", (e) => {
    if (podeDesenhar) e.preventDefault();
    startDraw(e);
});

canvas.addEventListener("touchmove", (e) => {
    if (podeDesenhar) e.preventDefault();
    draw(e);
});

canvas.addEventListener("touchend", endDraw);