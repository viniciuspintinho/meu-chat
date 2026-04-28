const socket = io();
const msgContainer = document.getElementById('messages');
const msgInput = document.getElementById('input');

// Lista de admins
const ADMINS = ["vn7", "pl"];

let selectedReply = null;
let lastSenderId = null;
let typingTimeout;

let userXP = parseInt(localStorage.getItem('chat_xp')) || 0;
let userLevel = parseInt(localStorage.getItem('chat_level')) || 1;

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
// ENVIAR MSG
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
// RECEBER MSG
// =========================
socket.on('message', (data) => {

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

    const myUser = JSON.parse(sessionStorage.getItem('chat_user'));

    if (myUser && data.text.includes(`@${myUser.name}`)) {
        playNotificationSound();
    }

    const isAdminMsg = ADMINS.includes(data.name);

    let bubbleStyle = isMe
        ? 'bubble-me rounded-2xl'
        : 'bg-white/5 rounded-2xl';

    if (isAdminMsg) bubbleStyle += ' admin-glow';

    let txt = data.text
        .replace(/@(\w+)/g, '<span class="text-blue-400 font-bold">@$1</span>')
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    let messageContent =
        data.text.match(/\.(jpeg|jpg|gif|png|webp)$/i)
            ? `<img src="${data.text}" class="max-w-xs rounded-lg shadow-xl">`
            : `<p>${txt}</p>`;

    div.innerHTML = `
        <div class="max-w-[80%] ${bubbleStyle} p-3 relative group cursor-pointer"
        onclick="setReply('${data.name}','${data.text.replace(/'/g, "\\'")}')">

            ${!isSequencial ? `<div class="font-bold mb-1">${data.name}</div>` : ''}

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

    userList.innerHTML = users.map(u => `
        <div class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition">
            <img src="${u.avatar}" class="w-8 h-8 rounded-full object-cover">
            <span class="text-xs ${ADMINS.includes(u.name) ? 'text-yellow-400 font-bold' : 'text-gray-400'}">
                ${u.name}
            </span>
        </div>
    `).join('');
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

canvas.addEventListener("touchstart", e => startDraw(e.touches[0]));
canvas.addEventListener("touchmove", e => {
    e.preventDefault();
    draw(e.touches[0]);
});
canvas.addEventListener("touchend", endDraw);

clearBtn.onclick = () => socket.emit("clearMyCanvas");

socket.on("draw", data => {
    ctx.lineTo(data.x, data.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(data.x, data.y);
});

socket.on("clearCanvas", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on("garticStatus", data => {
    garticBox.classList.remove("hidden");
    garticInfo.innerText = `🎨 ${data.desenhista} está desenhando`;
    podeDesenhar = false;
});

socket.on("garticPalavra", palavra => {
    garticBox.classList.remove("hidden");
    garticInfo.innerText = `✏️ Sua palavra: ${palavra}`;
    podeDesenhar = true;
});

socket.on("garticRanking", ranking => {
    rankingDiv.innerHTML = Object.entries(ranking)
        .map(([nome, pts]) => `🏆 ${nome}: ${pts} pts`)
        .join("<br>");
});