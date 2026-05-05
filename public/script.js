const socket = io();
const msgContainer = document.getElementById('messages');
const msgInput = document.getElementById('input');
const garticChatContainer = document.getElementById('gartic-chat-messages');
const garticInput = document.getElementById('gartic-input');

// AudioContext para notificações (criado sob demanda para evitar bloqueio em alguns navegadores)
let audioCtx;

// Lista de admins
const ADMINS = ["vn7", "pl"];

let selectedReply = null;
let lastSenderId = null;
let typingTimeout;

// NOVO E RECUPERADO: Variáveis para Menções e Emojis
let usersForMention = [];
let mentionIndex = 0;
const mentionMenu = document.getElementById('mention-menu');
const mentionList = document.getElementById('mention-list');

const emojiMenu = document.getElementById('emoji-menu');
const emojiList = document.getElementById('emoji-list');
const EMOJIS = {
    ":smile:": "😊", ":heart:": "❤️", ":fire:": "🔥", ":laugh:": "😂", 
    ":cry:": "😢", ":cool:": "😎", ":think:": "🤔", ":clap:": "👏",
    ":rocket:": "🚀", ":star:": "⭐", ":check:": "✅", ":warn:": "⚠️"
};

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
    return `<img src="${text}" class="max-w-[300px] max-h-[300px] object-cover mt-2 rounded-lg shadow-xl border border-white/10">`;
}
    
    let txt = text.replace(/@(\w+)/g, '<span class="text-blue-400 font-bold">@$1</span>')
                  .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    return `<p>${txt}</p>`;
}

// =========================
// NOTIFICAÇÕES PUSH
// =========================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
            console.log('Service Worker registrado:', registration);
        })
        .catch((error) => {
            console.log('Erro ao registrar SW:', error);
        });
}

function sendNotification(message) {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'notification',
            body: message
        });
    }
}

function playNotificationSound() {
    if (!audioCtx) {
        try {
            audioCtx = new AudioContext();
        } catch (error) {
            console.warn('AudioContext não disponível:', error);
            return;
        }
    }

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
// NOVO: SALAS (ROOMS)
// =========================
function changeRoom(roomName) {
    // 1. Pega os dados de quem está logado
    const user = JSON.parse(sessionStorage.getItem('chat_user') || "{}");
    
    // 2. Verifica se o nome dele está na lista de ADMINS (que você já criou lá no topo do seu script)
    const isAdm = ADMINS.includes(user.name);

    // 3. SE a sala for 'Desenvolvedores' E ele NÃO for admin, ele para aqui
    if (roomName === 'Desenvolvedores' && !isAdm) {
        alert("Ops! Apenas admins entram aqui.");
        return; // O código para aqui e não envia nada pro servidor
    }

    // 4. Se ele for admin ou for outra sala, ele segue normal
    socket.emit('joinRoom', roomName);
    
    // ... restante do seu código de mudar cor de botão ...
    document.getElementById('room-title').innerText = roomName;
    msgContainer.innerHTML = '';
}

socket.on('roomInfo', (roomName) => {
    document.getElementById('room-title').innerText = roomName;
});

// =========================
// MODO NOTURNO/DIA AUTOMÁTICO
// =========================
function applyAutoTheme() {
    const hour = new Date().getHours();
    const isNight = hour >= 18 || hour < 6; // Noturno das 18h às 6h
    const theme = isNight ? '#050508' : '#ffffff'; // Fundo escuro ou claro
    document.documentElement.style.setProperty('--theme-color', isNight ? '#0095f6' : '#42e97f');
    document.body.style.background = theme;
    localStorage.setItem('auto_theme', isNight ? 'night' : 'day');
}

// Aplicar tema automático ao carregar
window.onload = () => {
    applyAutoTheme();
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

    // Não esconder aqui, esperar confirmação
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
// SHOUT & NOVO: PINS
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

socket.on('newPin', (text) => {
    const banner = document.getElementById('pin-banner');
    const pinText = document.getElementById('pin-text');
    pinText.innerText = text;
    banner.classList.remove('hidden');
});

// =========================
// TYPING & NOVO: MENTIONS/EMOJIS
// =========================
socket.on('displayTyping', (data) => {
    document.getElementById('typing-indicator').innerText =
        data.typing ? `${data.name} está digitando...` : '';
});

msgInput.addEventListener('keyup', (e) => {
    const val = msgInput.value;
    const words = val.split(" ");
    const lastWord = words[words.length - 1];

    // Lógica de Menções @
    if (lastWord.startsWith("@") && lastWord.length > 1) {
        const query = lastWord.slice(1).toLowerCase();
        const filtered = usersForMention.filter(u => u.name.toLowerCase().includes(query));
        
        if (filtered.length > 0) {
            renderMentionMenu(filtered);
            mentionMenu.classList.remove('hidden');
            emojiMenu.classList.add('hidden');
        } else {
            mentionMenu.classList.add('hidden');
        }
    } 
    // Lógica de Emojis :
    else if (lastWord.startsWith(":") && lastWord.length > 1) {
        const query = lastWord.toLowerCase();
        const filteredKeys = Object.keys(EMOJIS).filter(k => k.includes(query));
        
        if (filteredKeys.length > 0) {
            renderEmojiMenu(filteredKeys);
            emojiMenu.classList.remove('hidden');
            mentionMenu.classList.add('hidden');
        } else {
            emojiMenu.classList.add('hidden');
        }
    }
    else {
        mentionMenu.classList.add('hidden');
        emojiMenu.classList.add('hidden');
    }
});

msgInput.addEventListener('input', () => {
    socket.emit('typing', true);

    clearTimeout(typingTimeout);

    typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 2000);
});

// Funções de Menu
function renderEmojiMenu(list) {
    emojiList.innerHTML = list.map(key => `
        <div class="emoji-item p-2 text-xs cursor-pointer hover:bg-white/10 transition" 
             onclick="selectEmoji('${key}')">
            ${EMOJIS[key]} ${key}
        </div>
    `).join('');
}

function selectEmoji(key) {
    const words = msgInput.value.split(" ");
    words.pop();
    msgInput.value = words.join(" ") + (words.length > 0 ? " " : "") + EMOJIS[key] + " ";
    emojiMenu.classList.add('hidden');
    msgInput.focus();
}

function renderMentionMenu(list) {
    mentionList.innerHTML = list.map((u, i) => `
        <div class="mention-item p-2 text-xs cursor-pointer hover:bg-white/10 transition ${i === mentionIndex ? 'bg-white/10' : ''}" 
             onclick="selectMention('${u.name}')">
            @${u.name}
        </div>
    `).join('');
}

function selectMention(name) {
    const words = msgInput.value.split(" ");
    words.pop();
    msgInput.value = words.join(" ") + (words.length > 0 ? " " : "") + "@" + name + " ";
    mentionMenu.classList.add('hidden');
    msgInput.focus();
}

document.addEventListener('click', (e) => {
    if (mentionMenu && !mentionMenu.contains(e.target)) mentionMenu.classList.add('hidden');
    if (emojiMenu && !emojiMenu.contains(e.target)) emojiMenu.classList.add('hidden');
});

// =========================
// NOVO: HOVER CARD (PREVIEW PERFIL)
// =========================
const hoverCard = document.getElementById('hover-card');

function getTitle(level) {
    if (level < 5) return "Novato do Chat";
    if (level < 15) return "Frequentador";
    if (level < 30) return "Veterano Elite";
    return "Mestre do Desenho";
}

function showHoverCard(name, e) {
    const user = usersForMention.find(u => u.name === name);
    if (!user) return;

    document.getElementById('hover-avatar').src = user.avatar;
    document.getElementById('hover-name').innerText = user.name;
    document.getElementById('hover-level').innerText = user.level || 1;
    document.getElementById('hover-title').innerText = getTitle(user.level || 1);
    document.getElementById('hover-xp-bar').style.width = (user.xp || 0) + "%";

    // Medals
    const daysSinceJoin = (Date.now() - user.joinDate) / (1000 * 60 * 60 * 24);
    document.getElementById('medal-tagarela').style.opacity = user.msgCount >= 1000 ? '1' : '0.2';
    document.getElementById('medal-pintor').style.opacity = user.garticWins >= 10 ? '1' : '0.2';
    document.getElementById('medal-antigo').style.opacity = daysSinceJoin >= 30 ? '1' : '0.2';

    // CSS para garantir que o card não seja cortado
    hoverCard.style.position = 'fixed';
    hoverCard.style.zIndex = '9999';
    hoverCard.style.display = 'block';
    
    // Cálculo de posição para evitar sair da tela
    let posX = e.clientX + 15;
    let posY = e.clientY + 15;

    // Se o card for sair pela direita
    if (posX + 220 > window.innerWidth) {
        posX = e.clientX - 230;
    }

    // Se o card for sair por baixo
    if (posY + 150 > window.innerHeight) {
        posY = e.clientY - 160;
    }

    hoverCard.style.left = posX + 'px';
    hoverCard.style.top = posY + 'px';
}

function hideHoverCard() {
    hoverCard.style.display = 'none';
}

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
    else if (cmd === '/pin' && isAdm) {
        socket.emit('pinMessage', target);
        res.silent = true;
    }
    else if (cmd === '/addcmd' && isAdm) {
        return val; 
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
// RECEBER MSG (ATUALIZADO)
// =========================
socket.on('message', (data) => {
    const meuUser = JSON.parse(sessionStorage.getItem('chat_user'));
    const lowerText = data.text ? data.text.toLowerCase() : "";

    // 1. FILTRO DE GARTIC (Acertos e Dicas)
    if (data.msgType === "gartic-success" || data.msgType === "gartic-hint" || (data.name === "Lux Bot" && lowerText.includes("acertou"))) {
        const divG = document.createElement('div');
        
        if (data.msgType === "gartic-success" || lowerText.includes("acertou")) {
            divG.className = "p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-[11px] font-bold text-green-400 animate-bounce text-center mb-1";
            divG.innerHTML = `✨ ${data.text}`;
        } else {
            divG.className = "p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-500 text-center mb-1";
            divG.innerHTML = data.text;
        }

        garticChatContainer.appendChild(divG);
        garticChatContainer.scrollTop = garticChatContainer.scrollHeight;
        return; 
    }

    // 2. FILTRO PALPITE GARTIC
    if (data.msgType === "gartic-guess") {
        const div = document.createElement('div');
        div.className = "p-2 rounded-lg bg-white/5 border border-white/5 text-xs animate-pulse mb-1";
        div.innerHTML = `<span class="font-bold text-blue-400">${data.name}:</span> ${data.text}`;
        garticChatContainer.appendChild(div);
        garticChatContainer.scrollTop = garticChatContainer.scrollHeight;
        return; 
    }

    // 3. LOGICA CHAT NORMAL
    const isMe = data.id === socket.id;
    const isSequencial = data.id === lastSenderId;
    lastSenderId = data.id;

    if (data.id === "bot" || data.name === "SISTEMA" || data.name === "Lux Bot") {
        const divSystem = document.createElement('div');
        divSystem.className = `flex justify-center w-full ${isSequencial ? 'mt-0.5' : 'mt-4'} message-animate`;
        divSystem.innerHTML = `<div class="system-msg">${data.text}</div>`;
        msgContainer.appendChild(divSystem);
        msgContainer.scrollTop = msgContainer.scrollHeight;
        return;
    }

    if (meuUser && data.text.includes(`@${meuUser.name}`)) {
        playNotificationSound();
        sendNotification(`Você foi mencionado por ${data.name}: ${data.text}`);
    }

    const isAdminMsg = ADMINS.includes(data.name);
    let bubbleStyle = isMe ? 'bubble-me rounded-2xl' : 'bg-white/5 rounded-2xl';
    if (isAdminMsg) bubbleStyle += ' admin-glow';

    const safeText = data.text.replace(/['"\\`]/g, "").replace(/\n/g, " ");

    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full ${isSequencial ? 'mt-0.5' : 'mt-4'} message-animate`;

    div.innerHTML = `
        <div class="max-w-[80%] ${bubbleStyle} p-3 relative group cursor-pointer"
             onclick="setReply('${data.name}', '${safeText}')">
            ${!isSequencial ? `<div class="user-label font-bold mb-1 text-xs ${isAdminMsg ? 'admin-name-highlight' : 'text-blue-400'}" 
                onmouseenter="showHoverCard('${data.name}', event)" 
                onmouseleave="hideHoverCard()">${data.name}</div>` : ''}
            ${generatePreview(data.text)}
            <div class="reaction-buttons opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 mt-2">
                <button onclick="reactToMessage('${data.id}', '👍')" class="text-xs bg-white/10 px-2 py-1 rounded">👍</button>
                <button onclick="reactToMessage('${data.id}', '😂')" class="text-xs bg-white/10 px-2 py-1 rounded">😂</button>
                <button onclick="reactToMessage('${data.id}', '❤️')" class="text-xs bg-white/10 px-2 py-1 rounded">❤️</button>
            </div>
        </div>
    `;

    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

// =========================
// USERS ONLINE
// =========================
socket.on('updateUserList', (users) => {
    usersForMention = users; 
    const userList = document.getElementById('user-list');

    userList.innerHTML = users.map(u => {
        const isAdm = ADMINS.includes(u.name);
        return `
            <div class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition cursor-pointer" 
                 onmouseenter="showHoverCard('${u.name}', event)" 
                 onmouseleave="hideHoverCard()">
                <img src="${u.avatar}" class="w-8 h-8 rounded-full object-cover ${isAdm ? 'avatar-active' : ''}">
                <span class="text-xs ${isAdm ? 'text-red-500 font-bold' : 'text-gray-400'}">
                    ${u.name}
                </span>
            </div>
        `;
    }).join('');

    // Esconder login se ainda estiver visível (primeiro login)
    if (!document.getElementById('login').classList.contains('hidden')) {
        const user = JSON.parse(sessionStorage.getItem('chat_user') || '{}');
        document.getElementById('my-avatar').src = user.avatar;
        document.getElementById('my-name').innerText = user.name;
        document.getElementById('login').classList.add('hidden');
    }

    // Mostrar botão de logs para admins após login
    const currentUser = JSON.parse(sessionStorage.getItem('chat_user') || '{}');
    if (ADMINS.includes(currentUser.name)) {
        document.getElementById('logs-btn').style.display = 'block';
    }
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

function openAchievements() {
    const meuUser = JSON.parse(sessionStorage.getItem('chat_user'));
    const user = usersForMention.find(u => u.name === meuUser.name);
    if (!user) return;

    const daysSinceJoin = (Date.now() - user.joinDate) / (1000 * 60 * 60 * 24);

    document.getElementById('ach-tagarela-count').innerText = `${user.msgCount} / 1000 Mensagens`;
    document.getElementById('ach-pintor-count').innerText = `${user.garticWins} / 10 Vitórias Gartic`;
    document.getElementById('ach-antigo-status').innerText = daysSinceJoin >= 30 ? 'Conquistado!' : `Faltam ${Math.ceil(30 - daysSinceJoin)} dias...`;

    // Update opacity
    document.getElementById('ach-tagarela').style.opacity = user.msgCount >= 1000 ? '1' : '0.4';
    document.getElementById('ach-pintor').style.opacity = user.garticWins >= 10 ? '1' : '0.4';
    document.getElementById('ach-antigo').style.opacity = daysSinceJoin >= 30 ? '1' : '0.4';

    document.getElementById('achievements-modal').classList.remove('hidden');
}

function changeTheme(hex) {
    applyTheme(hex);
}

function viewLogs() {
    socket.emit('chatMessage', { text: '/logs' });
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

function reactToMessage(messageId, emoji) {
    socket.emit('reactMessage', { messageId, emoji });
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
    if(!parent) return;
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

socket.on('deleteMessage', (messageId) => {
    // Remover a mensagem do DOM
    const messages = document.querySelectorAll('#messages > div');
    messages.forEach(div => {
        if (div.innerHTML.includes(messageId)) {
            div.remove();
        }
    });
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

// Verificar admin para logs
const user = JSON.parse(sessionStorage.getItem('chat_user') || '{}');
if (ADMINS.includes(user.name)) {
    document.getElementById('logs-btn').style.display = 'block';
}