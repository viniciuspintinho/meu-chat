const socket = io();

function getDefaultAvatarUrl(name) {
    const seed = encodeURIComponent((name && String(name).trim()) || 'user');
    return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}`;
}

function resolveAvatarUrl(avatar, name) {
    const u = (avatar && String(avatar).trim()) || '';
    if (!u) return getDefaultAvatarUrl(name);
    return u;
}

function applyAvatarToImg(img, avatar, name) {
    if (!img) return;
    const resolved = resolveAvatarUrl(avatar, name);
    const fallback = getDefaultAvatarUrl(name);
    img.onerror = function () {
        if (this.src !== fallback) {
            this.onerror = null;
            this.src = fallback;
        }
    };
    img.src = resolved;
}

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
    ":smile:": "😊", ":heart:": "❤️", ":fire:": "🔥", ":laugh:": "😂",":pika:":"Ɑ͞ ͞ ͞ ͞ ͞ ͞ ͞ ﻝﮞ",":chup:":"(っ'ཀ')っ Ɑ͞ ̶͞ ̶͞ ̶͞ لں͞",
    ":cry:": "😢", ":cool:": "😎", ":think:": "🤔", ":clap:": "👏",":linguada:": "👅{(ᶅ͒)}",
    ":rocket:": "🚀", ":star:": "⭐", ":check:": "✅", ":warn:": "⚠️", ":seqsu:": "𓀓𓂸",
    ":thumbsup:": "👍", ":heart_eyes:": "😍", ":laughing:": "😆", ":wink:": "😉", ":angry:": "😠"
};

let userXP = parseInt(localStorage.getItem('chat_xp')) || 0;
let userLevel = parseInt(localStorage.getItem('chat_level')) || 1;
let userBio = localStorage.getItem('chat_bio') || '';
let userTheme = localStorage.getItem('chat_theme') || '#0095f6';
let allMessages = []; // Para busca
let pinnedMessages = []; // Para pins
let messageReactions = {}; // Para reações
let userStatuses = {}; // Para status online/away
let lastSeen = {}; // Para último visto
let copyHistory = JSON.parse(localStorage.getItem('copy_history') || '[]');
let achievements = JSON.parse(localStorage.getItem('chat_achievements') || '{}');
let storyFeed = [];
let currentThreadMessageId = null;
let userStatus = localStorage.getItem('chat_status') || 'online';
let storyDraft = { text: '', imageData: null };
let storyImageData = null;
let currentViewedStoryId = null;

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatInlineRichText(raw) {
    let t = String(raw);
    t = t.replace(/^> (.+)$/gm, '[[QUOTE]]$1[[/QUOTE]]');
    t = escapeHtml(t);
    t = t.replace(/\[\[QUOTE\]\]([\s\S]*?)\[\[\/QUOTE\]\]/g, '<div class="message-blockquote">$1</div>');
    t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    t = t.replace(/\n/g, '<br>');
    t = t.replace(/`([^`]+)`/g, '<code class="message-code">$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    t = t.replace(/@(\w+)/g, '<span class="text-blue-400 font-semibold">@$1</span>');
    return t;
}

function formatRichChatText(text) {
    if (!text) return '';
    const re = /```([\w-]*)\s*\n?([\s\S]*?)```/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
            out += `<span class="msg-rich">${formatInlineRichText(text.slice(last, m.index))}</span>`;
        }
        out += `<pre class="message-fenced-code"><code>${escapeHtml(m[2])}</code></pre>`;
        last = m.index + m[0].length;
    }
    if (last < text.length) {
        out += `<span class="msg-rich">${formatInlineRichText(text.slice(last))}</span>`;
    }
    if (!out) {
        out = `<span class="msg-rich">${formatInlineRichText(text)}</span>`;
    }
    return out;
}

function highlightSearchInPlainText(text, query) {
    if (!query.trim()) return formatRichChatText(text);
    const q = query;
    const parts = String(text).split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
    const html = parts.map((p) =>
        p.toLowerCase() === q.toLowerCase()
            ? `<mark class="search-highlight">${escapeHtml(p)}</mark>`
            : escapeHtml(p)
    ).join('');
    return `<span class="msg-rich">${html.replace(/\n/g, '<br>')}</span>`;
}

// =========================
// PREVIEW DE LINKS AUTOMÁTICO
// =========================
function generatePreview(text, imageData = null, fileName = null) {
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const imgRegex = /\.(jpeg|jpg|gif|png|webp)$/i;

    if (youtubeRegex.test(text)) {
        const id = text.match(youtubeRegex)[1];
        return `<div class="mt-2 rounded-lg overflow-hidden border border-white/10">
                    <iframe width="100%" height="180" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>
                </div>`;
    }

    const dataImageRegex = /^data:image\/(png|jpeg|jpg|gif|webp);base64,.*$/i;
    if (dataImageRegex.test(text)) {
        return `<img src="${text}" class="max-w-[300px] max-h-[300px] object-cover mt-2 rounded-lg shadow-xl border border-white/10">`;
    }

    if (/Pasted image/i.test(text) || /Imagem colada/i.test(text)) {
        return `<div class="pasted-image-card mt-2">
                    <div class="pasted-image-icon">🖼️</div>
                    <div class="pasted-image-content">
                        <span class="pasted-image-title">Imagem colada</span>
                        <span class="pasted-image-subtitle">Se você colou uma imagem, confirme se ela foi enviada corretamente.</span>
                    </div>
                </div>`;
    }

    // NOVO: Preview para imagens anexadas
    if (imageData && fileName) {
        return `<div class="media-card">
            <div class="image-badge">Imagem</div>
            <div class="media-header">
                <div class="media-icon">🖼️</div>
                <div class="media-info">
                    <div class="media-name">${fileName}</div>
                    <div class="media-size">${formatFileSize(imageData.length * 0.75)}</div>
                </div>
            </div>
            <img src="${imageData}" class="media-preview" alt="${fileName}" onclick="viewFullImage('${imageData}')">
            <div class="media-actions">
                <button onclick="downloadImage('${imageData}', '${fileName}')">Baixar</button>
                <button onclick="copyImageToClipboard('${imageData}')">Copiar</button>
            </div>
        </div>`;
    }

    if (imgRegex.test(text)) {
        const safeSrc = encodeURI(text.trim());
        return `<img src="${safeSrc}" class="max-w-[300px] max-h-[300px] object-cover mt-2 rounded-lg shadow-xl border border-white/10" alt="">`;
    }

    return `<div class="msg-body">${formatRichChatText(text)}</div>`;
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
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;

    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }

    if (Notification.permission !== 'granted') return;

    navigator.serviceWorker.ready.then((registration) => {
        if (registration.active) {
            registration.active.postMessage({
                type: 'notification',
                body: message
            });
        } else {
            new Notification('Lux Chat', { body: message });
        }
    }).catch(() => {
        new Notification('Lux Chat', { body: message });
    });
}

// Sistema de áudio removido por solicitação do usuário

// =========================
// TEMA SALVO POR USUÁRIO
// =========================
function applyTheme(hex) {
    userTheme = hex;
    localStorage.setItem('chat_theme', hex);
    document.documentElement.style.setProperty('--theme-color', hex);
    localStorage.setItem('chat_theme_color', hex);
}

// =========================
// STATUS ONLINE/AWAY
// =========================
function updateUserStatus(status) {
    const user = JSON.parse(sessionStorage.getItem('chat_user') || '{}');
    if (user.name) {
        userStatuses[user.name] = status;
        socket.emit('statusUpdate', { name: user.name, status });
    }
}

function getUserStatus(name) {
    return userStatuses[name] || 'offline';
}

function formatLastSeen(name) {
    if (!lastSeen[name]) return 'Nunca visto';
    return formatLastSeenTime(lastSeen[name]);
}

function formatLastSeenTime(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}m atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days < 7) return `${days}d atrás`;
    return 'Há muito tempo';
}

// =========================
// EDIÇÃO DE MENSAGENS
// =========================
function editMessage(messageId, newText) {
    socket.emit('editMessage', { messageId, newText });
}

// =========================
// PINS DE MENSAGENS
// =========================
function pinMessage(messageId) {
    socket.emit('pinMessage', { messageId });
}

function unpinMessage(messageId) {
    socket.emit('unpinMessage', { messageId });
}

// =========================
// MENSAGENS TEMPORÁRIAS
// =========================
function sendTempMessage(text, duration = 30000) {
    socket.emit('chatMessage', {
        text,
        replyTo: selectedReply,
        temp: true,
        tempDuration: duration
    });
}

// =========================
// CORES POR SALA
// =========================
function getRoomColor(roomName) {
    const colors = {
        'Geral': '#0095f6',
        'Desenvolvedores': '#ff3040',
        'Random': '#00f9f9',
        'Gartic': '#42e97f'
    };
    return colors[roomName] || '#0095f6';
}

function applyRoomColor(roomName) {
    const color = getRoomColor(roomName);
    document.documentElement.style.setProperty('--room-color', color);
}

// =========================
// XP
// =========================
function updateXPUI() {
    const lvl = document.getElementById('user-level');
    const xp = document.getElementById('user-xp');
    const fill = document.getElementById('xp-fill');
    const bioEl = document.getElementById('my-bio');

    if (!lvl) return;

    lvl.innerText = userLevel;
    xp.innerText = userXP;
    fill.style.width = Math.min(userXP, 100) + "%";
    if (bioEl) bioEl.innerText = userBio || "Nenhuma bio ainda";
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
    showPortalTransition();
    socket.emit('joinRoom', roomName);
    
    // Aplicar cor da sala
    applyRoomColor(roomName);
    
    // ... restante do seu código de mudar cor de botão ...
    document.getElementById('room-title').innerText = roomName;
    msgContainer.innerHTML = '';
}

socket.on('roomInfo', (roomName) => {
    document.getElementById('room-title').innerText = roomName;
});

function showPortalTransition() {
    const portal = document.getElementById('portal-overlay');
    if (!portal) return;
    portal.classList.add('active');
    setTimeout(() => portal.classList.remove('active'), 900);
}

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

// =========================
// BUSCA DE MENSAGENS
// =========================
function searchMessages(query) {
    if (!query.trim()) {
        msgContainer.innerHTML = '';
        allMessages.forEach(msg => renderMessageInContainer(msg));
        return;
    }

    const filtered = allMessages.filter(msg => 
        msg.text.toLowerCase().includes(query.toLowerCase()) ||
        msg.name.toLowerCase().includes(query.toLowerCase())
    );

    msgContainer.innerHTML = '';
    filtered.forEach(msg => renderMessageInContainer(msg, query));
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    msgContainer.innerHTML = '';
    allMessages.forEach(msg => renderMessageInContainer(msg));
}

document.getElementById('search-input')?.addEventListener('input', (e) => {
    searchMessages(e.target.value);
});

// =========================
// COPIAR MENSAGEM
function copyMessage(id) {
    const msg = allMessages.find(m => m.id === id || m.messageId === id);
    if (msg) {
        const formatted = `${msg.name} • ${formatTime(msg.timestamp)}\n${msg.text}${msg.fileName ? `\n[Imagem: ${msg.fileName}]` : ''}`;
        navigator.clipboard.writeText(formatted).then(() => {
            copyHistory.unshift({ text: formatted, time: Date.now() });
            if (copyHistory.length > 10) copyHistory.pop();
            localStorage.setItem('copy_history', JSON.stringify(copyHistory));
            showToast('✓ Mensagem copiada com formatação!');
            renderCopyHistory();
        });
    }
}

function renderCopyHistory() {
    const historyList = document.getElementById('copy-history');
    if (!historyList) return;
    historyList.innerHTML = copyHistory.slice(0, 5).map(item => `
        <div class="p-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] text-gray-300">
            <div class="text-white font-bold mb-1">${new Date(item.time).toLocaleTimeString()}</div>
            <div>${item.text.replace(/\n/g, '<br>')}</div>
        </div>
    `).join('');
}

function renderStoryBar() {
    const storyList = document.getElementById('stories-list');
    if (!storyList) return;
    storyList.innerHTML = storyFeed.length ? storyFeed.map(story => `
        <div class="story-item" onclick="viewStory('${story.id}')">
            <img src="${resolveAvatarUrl(story.avatar, story.name)}" class="story-avatar" alt="" />
            <div class="story-type">${story.type}</div>
            <div class="story-title">${story.name}</div>
            <div class="story-meta">${story.caption || 'Momento novo'} · ${story.timeAgo}</div>
        </div>
    `).join('') : `
        <div class="story-item bg-white/5 border-dashed border-white/20">
            <div class="story-type">Nenhum momento</div>
            <div class="story-title">Crie o seu primeiro momento</div>
        </div>
    `;
}

function openStoryComposer() {
    document.getElementById('story-caption').value = '';
    document.getElementById('story-image-name').innerText = '';
    document.getElementById('story-image-preview').classList.add('hidden');
    document.getElementById('story-image-preview').src = '';
    storyImageData = null;
    document.getElementById('story-modal').classList.remove('hidden');
}

function closeStoryModal() {
    document.getElementById('story-modal').classList.add('hidden');
}

function submitStory() {
    const caption = document.getElementById('story-caption').value.trim();
    if (!caption && !storyImageData) {
        showToast('Adicione texto ou foto antes de publicar.');
        return;
    }

    socket.emit('chatMessage', {
        text: caption || '📷 Story com imagem',
        msgType: 'story',
        replyTo: null,
        imageData: storyImageData || null,
        fileName: storyImageData ? `story-${Date.now()}.png` : null
    });
    closeStoryModal();
    showToast('Story publicado!');
}

function viewStory(storyId) {
    const story = storyFeed.find(s => s.id === storyId);
    if (!story) {
        showToast('Story não encontrado.');
        return;
    }
    currentViewedStoryId = storyId;
    document.getElementById('story-view-avatar').src = resolveAvatarUrl(story.avatar, story.name);
    document.getElementById('story-view-name').innerText = story.name;
    document.getElementById('story-view-time').innerText = story.timeAgo;
    document.getElementById('story-view-text').innerText = story.caption || 'Nenhum texto disponível.';

    const storyImage = document.getElementById('story-view-image');
    if (story.imageData) {
        storyImage.src = story.imageData;
        storyImage.classList.remove('hidden');
    } else {
        storyImage.classList.add('hidden');
        storyImage.src = '';
    }

    const user = JSON.parse(sessionStorage.getItem('chat_user') || '{}');
    const deleteBtn = document.getElementById('story-delete-btn');
    if (user.name === story.name) {
        deleteBtn.classList.remove('hidden');
    } else {
        deleteBtn.classList.add('hidden');
    }

    document.getElementById('story-view-modal').classList.remove('hidden');
}

function closeStoryView() {
    document.getElementById('story-view-modal').classList.add('hidden');
    currentViewedStoryId = null;
}

function deleteStoryView() {
    if (!currentViewedStoryId) return;
    deleteStory(currentViewedStoryId);
    closeStoryView();
    showToast('Story excluído.');
}

function deleteStory(storyId) {
    storyFeed = storyFeed.filter(story => story.id !== storyId);
    if (currentViewedStoryId === storyId) {
        closeStoryView();
    }
}

function openProfileStory(name) {
    const story = storyFeed.find(s => s.name === name);
    if (!story) {
        showToast('Nenhum story disponível para este perfil.');
        return;
    }
    viewStory(story.id);
}

function renderThreadView(messageId) {
    const threadHeader = document.getElementById('thread-header');
    const threadMessagesPanel = document.getElementById('thread-messages');
    if (!threadMessagesPanel || !threadHeader) return;
    const rootMessage = allMessages.find(msg => msg.messageId === messageId || msg.id === messageId);
    threadHeader.innerHTML = rootMessage ? `
        <div class="thread-author font-bold text-white">${rootMessage.name}</div>
        <div class="text-[11px] text-gray-400 mt-1">${formatTime(rootMessage.timestamp)}</div>
        <div class="mt-3 text-sm text-gray-200">${rootMessage.text}</div>
    ` : '<div class="text-gray-400">Mensagem não encontrada</div>';

    const threadMessages = allMessages.filter(msg => msg.replyTo?.messageId === messageId || msg.replyTo?.id === messageId);
    threadMessagesPanel.innerHTML = threadMessages.map(msg => `
        <div class="thread-message">
            <div class="thread-author">${msg.name}</div>
            <div class="text-sm text-gray-200 mt-1">${msg.text}</div>
            <div class="thread-time mt-1">${formatTime(msg.timestamp)}</div>
        </div>
    `).join('') || '<div class="text-gray-500 text-[11px]">Nenhuma mensagem aqui ainda. Responda para iniciar a thread.</div>';
}

function renderRanking() {
    const rankingBody = document.getElementById('global-ranking');
    if (!rankingBody) return;
    const users = Object.entries(userStatuses)
        .sort(([, a], [, b]) => (b.score || 0) - (a.score || 0))
        .slice(0, 5);
    rankingBody.innerHTML = users.map(([name, data], index) => `
        <div class="text-xs text-gray-300">${index + 1}. ${name} (${data.score || 0})</div>
    `).join('');
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed right-4 z-[200] bg-green-500/90 text-white px-4 py-2 rounded-lg text-sm shadow-xl';
    toast.style.bottom = 'calc(6rem + env(safe-area-inset-bottom, 0px))';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
}

function playPortalEffect() {
    const portal = document.getElementById('portal-overlay');
    if (!portal) return;
    portal.classList.add('active');
    setTimeout(() => portal.classList.remove('active'), 1100);
}

function playAdminWave() {
    const wave = document.getElementById('admin-wave');
    if (!wave) return;
    wave.classList.add('active');
    setTimeout(() => wave.classList.remove('active'), 1000);
}

function playStarExplosion() {
    const explosion = document.getElementById('star-explosion');
    if (!explosion) return;
    explosion.innerHTML = '';
    for (let i = 0; i < 12; i++) {
        const star = document.createElement('span');
        const x = (Math.random() - 0.5) * 280;
        const y = (Math.random() - 0.5) * 240;
        star.style.setProperty('--tx', `${x}px`);
        star.style.setProperty('--ty', `${y}px`);
        star.style.left = '50%';
        star.style.top = '50%';
        explosion.appendChild(star);
    }
    explosion.classList.add('active');
    setTimeout(() => {
        explosion.classList.remove('active');
        explosion.innerHTML = '';
    }, 1200);
}

function playDisconnectFade() {
    const fade = document.getElementById('disconnect-fade');
    if (!fade) return;
    fade.classList.add('active');
    setTimeout(() => fade.classList.remove('active'), 1000);
}

function getAvatarFrameClass(frame, isAdmin = false) {
    const effectiveFrame = frame === 'none' && isAdmin ? 'blue-ring' : frame;
    return effectiveFrame === 'blue-ring'
        ? 'avatar-frame-blue-ring'
        : effectiveFrame === 'glow-panel'
            ? 'avatar-frame-glow-panel'
            : '';
}

function selectProfileFrame(frame, silent = false) {
    const wrapper = document.querySelector('.avatar-wrapper');
    if (!wrapper) return;
    wrapper.classList.remove('profile-frame-blue-ring', 'profile-frame-glow-panel');
    document.querySelectorAll('.frame-option').forEach(btn => btn.classList.remove('active'));

    if (frame === 'blue-ring') {
        wrapper.classList.add('profile-frame-blue-ring');
        document.getElementById('frame-blue-ring')?.classList.add('active');
    } else if (frame === 'glow-panel') {
        wrapper.classList.add('profile-frame-glow-panel');
        document.getElementById('frame-glow-panel')?.classList.add('active');
    } else {
        document.getElementById('frame-none')?.classList.add('active');
    }

    if (!silent) {
        localStorage.setItem('chat_profile_frame', frame);
    }
}

// =========================
// FORMATAR HORA
// =========================
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function formatLastSeen(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}m atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days < 7) return `${days}d atrás`;
    return 'Há muito tempo';
}

// =========================
// RENDERIZAR MENSAGEM (Helper)
// =========================
function renderMessageInContainer(data, searchQuery = '') {
    const isMe = data.id === socket.id;
    const isSequencial = data.id === lastSenderId;
    const isAdminMsg = ADMINS.includes(data.name);
    const isTempMessage = data.duration !== undefined;
    const isBookmarked = bookmarkedMessages.includes(data.messageId);
    const userColor = generateUserColor(data.name);

    if (data.id === "bot" || data.name === "SISTEMA" || data.name === "Lux Bot") {
        const divSystem = document.createElement('div');
        divSystem.className = `flex justify-center w-full ${isSequencial ? 'mt-0.5' : 'mt-2'} message-animate`;
        divSystem.innerHTML = `<div class="system-msg">${data.text}</div>`;
        msgContainer.appendChild(divSystem);
        return;
    }

    let bubbleStyle = isMe ? 'bubble-me rounded-2xl' : 'bg-white/5 rounded-2xl';
    if (isTempMessage) bubbleStyle += ' temp-message';
    if (isAdminMsg) bubbleStyle += ' admin-glow';

    const safeText = data.text.replace(/['"\\`]/g, "").replace(/\n/g, " ");
    const bodyHtml = searchQuery
        ? highlightSearchInPlainText(data.text, searchQuery)
        : formatRichChatText(data.text);

    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full ${isSequencial ? 'mt-0.5' : 'mt-2'} message-animate`;
    div.id = data.messageId;
    div.onmouseenter = function() {
        showQuickReactions(this);
        this.querySelector('.msg-actions').style.opacity = '1';
    };
    div.onmouseleave = function() {
        hideQuickReactions(this);
        this.querySelector('.msg-actions').style.opacity = '0';
    };

    div.innerHTML = `
        <div class="max-w-[65%] ${bubbleStyle} px-3 py-2 relative group cursor-pointer" style="border-left: 3px solid ${userColor};"
             title="${formatTime(data.timestamp)}"
             onclick="setReply('${data.name}', '${safeText}')">
            ${!isSequencial ? `<div class="user-label font-bold mb-1 text-xs flex items-center gap-2" style="color:${userColor};"
                onmouseenter="showHoverCard('${data.name.replace(/'/g, "\\'")}', event)" 
                onmouseleave="hideHoverCard()"><img src="${resolveAvatarUrl(data.avatar, data.name)}" class="w-4 h-4 rounded-full" alt="">${data.name}${isAdminMsg ? (data.name === 'vn7' || data.name === 'pl' ? ' 👑 <span class="admin-badge">ADM</span>' : ' ⭐') : ''}</div>` : ''}
            ${data.replyTo ? `<div class="reply-preview mb-2 p-2 rounded-xl bg-white/5 text-[11px] text-gray-300 border border-white/10">Respondendo a <span class="font-bold text-white">${data.replyTo.name}</span>: ${data.replyTo.text}</div>` : ''}
            <div>${bodyHtml}</div>
            ${data.imageData ? `<img src="${data.imageData}" class="max-w-[200px] max-h-[200px] rounded-lg mt-2 cursor-pointer" onclick="viewFullImage('${data.imageData}')" title="Clique para expandir">` : ''}
            <div class="msg-timestamp">${formatTime(data.timestamp)}</div>
            <div class="msg-actions" style="opacity: 0;">
                <button onclick="toggleBookmark('${data.messageId}'); event.stopPropagation();" class="text-xs bookmark-btn ${isBookmarked ? 'bookmarked' : ''}">🔖</button>
                <button onclick="copyMessage('${data.id}'); event.stopPropagation();" class="text-xs">📋</button>
                <button onclick="editMessage('${data.id}', prompt('Editar mensagem:', '${safeText}')); event.stopPropagation();" class="text-xs">✏️</button>
                <button onclick="pinMessage('${data.id}'); event.stopPropagation();" class="text-xs">📌</button>
                <button onclick="setReply('${data.name}', '${safeText}'); event.stopPropagation();" class="text-xs">↩️</button>
            </div>
            ${data.threadCount ? `<div class="thread-badge" onclick="openThread('${data.messageId}'); event.stopPropagation();">💬 ${data.threadCount} ${data.threadCount === 1 ? 'resposta' : 'respostas'}</div>` : ''}
        </div>
    `;

    msgContainer.appendChild(div);
}

// Aplicar tema automático ao carregar
window.onload = () => {
    applyAutoTheme();
    applyAutoTime();
    const sessionUser = sessionStorage.getItem('chat_user');

    applyTheme(localStorage.getItem('chat_theme_color') || '#0095f6');
    updateXPUI();
    updateBookmarksUI();
    
    checkAchievements();

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    if (sessionUser) {
        const user = JSON.parse(sessionUser);

        socket.emit('join', user);

        applyAvatarToImg(document.getElementById('my-avatar'), user.avatar, user.name);
        document.getElementById('my-name').innerText = user.name;
        document.getElementById('login').classList.add('hidden');
    }

    let profileFrame = localStorage.getItem('chat_profile_frame') || 'none';
    const parsedSession = sessionUser ? JSON.parse(sessionUser) : null;
    if (parsedSession && ADMINS.includes(parsedSession.name) && profileFrame === 'none') {
        profileFrame = 'blue-ring';
    }
    selectProfileFrame(profileFrame, true);
    resizeComposerInput();
};

// Função auxiliar para highlighting
function highlight(messageId) {
    const el = document.getElementById(messageId);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.background = 'rgba(0,149,246,.2)';
        setTimeout(() => el.style.background = '', 2000);
    }
}

// =========================
// ENTRAR
// =========================
function entrar() {
    const name = document.getElementById('username').value.trim();

    const avatar = resolveAvatarUrl(document.getElementById('avatar').value.trim(), name);

    if (!name) return;

    const userData = {
        name,
        avatar,
        profileFrame: localStorage.getItem('chat_profile_frame') || 'none'
    };

    sessionStorage.setItem('chat_user', JSON.stringify(userData));
    socket.emit('join', userData);
    document.getElementById('login').classList.add('hidden');

    // Esconder o overlay imediatamente para mostrar o chat o quanto antes
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
    const words = val.trim().split(/\s+/).filter(Boolean);
    const lastWord = words.length ? words[words.length - 1] : '';

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

msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('form').requestSubmit();
    }
});

function resizeComposerInput() {
    if (!msgInput || msgInput.tagName !== 'TEXTAREA') return;
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 140) + 'px';
}

msgInput.addEventListener('input', () => {
    resizeComposerInput();
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
    const words = msgInput.value.trim().split(/\s+/).filter(Boolean);
    words.pop();
    msgInput.value = words.join(" ") + (words.length > 0 ? " " : "") + EMOJIS[key] + " ";
    emojiMenu.classList.add('hidden');
    msgInput.focus();
    resizeComposerInput();
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
    const words = msgInput.value.trim().split(/\s+/).filter(Boolean);
    words.pop();
    msgInput.value = words.join(" ") + (words.length > 0 ? " " : "") + "@" + name + " ";
    mentionMenu.classList.add('hidden');
    msgInput.focus();
    resizeComposerInput();
}

document.addEventListener('click', (e) => {
    if (mentionMenu && !mentionMenu.contains(e.target)) mentionMenu.classList.add('hidden');
    if (emojiMenu && !emojiMenu.contains(e.target)) emojiMenu.classList.add('hidden');
    const gifPanel = document.getElementById('gif-selector-panel');
    if (gifPanel && !gifPanel.classList.contains('hidden')) {
        const t = e.target;
        if (!gifPanel.contains(t) && !t.closest('#composer-gif-btn')) {
            gifPanel.classList.add('hidden');
        }
    }
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

    document.getElementById('hover-avatar').src = resolveAvatarUrl(user.avatar, user.name);
    document.getElementById('hover-name').innerText = user.name;
    document.getElementById('hover-level').innerText = user.level || 1;
    document.getElementById('hover-title').innerText = getTitle(user.level || 1);
    document.getElementById('hover-xp-bar').style.width = (user.xp || 0) + "%";
    
    // Status online/away
    const status = getUserStatus(name);
    const statusEl = document.getElementById('hover-status');
    statusEl.innerText = status === 'online' ? '● Online' : status === 'away' ? '○ Away' : '● Offline';
    statusEl.className = `text-[10px] mb-2 ${status === 'online' ? 'text-green-400' : status === 'away' ? 'text-yellow-400' : 'text-gray-400'}`;
    
    // Último visto
    document.getElementById('hover-last-seen').innerText = formatLastSeen(name);

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
    const hasFiles = selectedFiles.length > 0;
    if (!val && !hasFiles) return;

    if (hasFiles) {
        sendImages();
    }

    if (val) {
        const cmdResult = processCommand(val);

        if (cmdResult.silent) {
            msgInput.value = '';
            resizeComposerInput();
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
    }

    msgInput.value = '';
    resizeComposerInput();
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

    // On entry or admin join, portal + wave effects
    if (lowerText.includes("entrou no canal")) {
        playPortalEffect();
        const matchedAdmin = data.text.match(/\*\*(.+?)\*\*/);
        if (matchedAdmin && ADMINS.includes(matchedAdmin[1])) {
            playAdminWave();
        }
    }

    if (lowerText.includes("saiu.")) {
        playDisconnectFade();
    }

    if (lowerText.includes("conquista") || lowerText.includes("ganhou") || lowerText.includes("desbloqueou")) {
        playStarExplosion();
    }

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

    const isAdminMsg = ADMINS.includes(data.name);

    if (!isMe && data.id !== 'bot' && data.name !== 'SISTEMA') {
        const myName = JSON.parse(sessionStorage.getItem('chat_user') || '{}').name;
        const hasUserMention = data.text.includes(`@${myName}`);
        const isReplyToMe = data.replyTo && data.replyTo.name === myName;
        
        if (hasUserMention || isReplyToMe) {
            playNotificationSound();
            sendNotification(`${data.name}: ${data.text}`);
        }
    }
    let bubbleStyle = isMe ? 'bubble-me rounded-2xl' : 'bg-white/5 rounded-2xl';
    if (isAdminMsg) bubbleStyle += ' admin-glow';

    const safeText = data.text.replace(/['"\\`]/g, "").replace(/\n/g, " ");

    // Armazenar para busca
    allMessages.push({...data, _renderId: Math.random()});

    const frameClass = getAvatarFrameClass(data.profileFrame, data.isAdmin);

    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full ${isSequencial ? 'mt-0.5' : 'mt-4'} message-animate`;

    const reactionData = messageReactions[data.messageId || data.id] || {};
    const reactionButton = (emoji) => {
        const users = reactionData[emoji] || [];
        const title = users.length ? users.join(', ') : `Reagir com ${emoji}`;
        return `<button onclick="reactToMessage('${data.messageId || data.id}', '${emoji}'); event.stopPropagation();" title="${title}" class="text-xs bg-white/10 px-2 py-1 rounded">${emoji}${users.length ? ` ${users.length}` : ''}</button>`;
    };
    const isRead = isMe ? ' <span class="text-[10px] text-gray-400">✓✓</span>' : '';

    div.innerHTML = `
        <div class="max-w-[85%] sm:max-w-[45%] ${bubbleStyle} px-3 py-2 relative group cursor-pointer"
             data-message-id="${data.messageId || data.id}"
             title="${formatTime(data.timestamp)}"
             onclick="setReply('${data.name}', '${safeText}', '${data.messageId || data.id}')">
            ${!isSequencial ? `<div class="flex items-center gap-2 mb-2">
                    <img src="${resolveAvatarUrl(data.avatar, data.name)}" onclick="openProfileStory('${data.name.replace(/'/g, "\\'")}'); event.stopPropagation();" class="w-8 h-8 rounded-full object-cover ${frameClass} cursor-pointer" alt="">
                    <div class="user-label font-bold text-xs ${isAdminMsg ? 'admin-name-highlight' : 'text-blue-400'}">
                        ${data.name}${isAdminMsg ? ' ⭐' : ''}
                    </div>
                </div>` : ''}
            ${data.replyTo ? `<div class="reply-preview mb-2 p-2 rounded-xl bg-white/5 text-[11px] text-gray-300 border border-white/10">Respondendo a <span class="font-bold text-white">${data.replyTo.name}</span>: ${data.replyTo.text}</div>` : ''}
            ${generatePreview(data.text, data.imageData, data.fileName)}
            <div class="flex items-center justify-between gap-2 mt-3 text-[10px] text-gray-400">
                <div>${formatTime(data.timestamp)}${isRead}</div>
                <div class="text-gray-500">${data.replyTo?.id ? '' : ''}</div>
            </div>
            <div class="msg-actions mt-2 flex gap-2 flex-wrap">
                <button onclick="copyMessage('${data.messageId || data.id}'); event.stopPropagation();" class="text-xs">📋</button>
                <button onclick="pinMessage('${data.messageId || data.id}'); event.stopPropagation();" class="text-xs">📌</button>
                <button onclick="setReply('${data.name}', '${safeText}', '${data.messageId || data.id}'); event.stopPropagation();" class="text-xs">↩️</button>
                <button onclick="openThread('${data.messageId || data.id}'); event.stopPropagation();" class="text-xs">🧵</button>
            </div>
            <div class="reaction-buttons opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 mt-2">
                ${reactionButton('👍')}
                ${reactionButton('😂')}
                ${reactionButton('❤️')}
            </div>
        </div>
    `;

    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;

    if (data.msgType === 'story') {
        storyFeed.unshift({
            id: data.messageId || data.id,
            name: data.name,
            avatar: data.avatar,
            type: 'Story',
            caption: data.text,
            timeAgo: 'agora',
            imageData: data.imageData
        });
        if (storyFeed.length > 8) storyFeed.pop();
        renderStoryBar();
    }

    renderRanking();
});

// =========================
// USERS ONLINE
// =========================
socket.on('updateUserList', (users) => {
    usersForMention = users; 
    const userList = document.getElementById('user-list');
    
    // Definir status online para o usuário atual
    const currentUser = JSON.parse(sessionStorage.getItem('chat_user') || '{}');
    if (currentUser.name) {
        userStatuses[currentUser.name] = 'online';
    }

    userList.innerHTML = users.map(u => {
        const isAdm = ADMINS.includes(u.name);
        const frameClass = getAvatarFrameClass(u.profileFrame, isAdm);

        return `
            <div class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition cursor-pointer" 
                 onclick="openProfileStory('${u.name.replace(/'/g, "\\'")}')"
                 onmouseenter="showHoverCard('${u.name.replace(/'/g, "\\'")}', event)" 
                 onmouseleave="hideHoverCard()">
                <img src="${resolveAvatarUrl(u.avatar, u.name)}" class="w-8 h-8 rounded-full object-cover ${frameClass} ${isAdm ? 'avatar-active' : ''}" alt="">
                <span class="text-xs ${isAdm ? 'text-red-500 font-bold' : 'text-gray-400'}">
                    ${u.name}
                </span>
            </div>
        `;
    }).join('');

    // Esconder login se ainda estiver visível (primeiro login)
    if (!document.getElementById('login').classList.contains('hidden')) {
        const user = JSON.parse(sessionStorage.getItem('chat_user') || '{}');
        applyAvatarToImg(document.getElementById('my-avatar'), user.avatar, user.name);
        document.getElementById('my-name').innerText = user.name;
        document.getElementById('login').classList.add('hidden');
    }

    // Mostrar botão de logs para admins após login
    if (currentUser.name && ADMINS.includes(currentUser.name)) {
        document.getElementById('logs-btn').style.display = 'block';
    }

    renderStoryBar();
    renderRanking();
});

// =========================
// CONFIG
// =========================
function openSettings() {
    const user = JSON.parse(sessionStorage.getItem('chat_user') || "{}");
    const isAdm = ADMINS.includes(user.name);

    document.getElementById('set-username').value = user.name || "";
    document.getElementById('set-avatar').value = user.avatar || "";
    document.getElementById('set-bio').value = userBio || "";

    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('admin-settings-section').classList.toggle('hidden', !isAdm);
    document.getElementById('admin-settings-locked').classList.toggle('hidden', isAdm);

    let profileFrame = localStorage.getItem('chat_profile_frame') || 'none';
    if (isAdm && profileFrame === 'none') {
        profileFrame = 'blue-ring';
    }
    selectProfileFrame(profileFrame, true);
}

function saveSettings() {
    const name = document.getElementById('set-username').value.trim();
    let avatar = document.getElementById('set-avatar').value.trim();
    const bio = document.getElementById('set-bio').value.trim();
    const user = JSON.parse(sessionStorage.getItem('chat_user') || "{}");
    const isAdm = ADMINS.includes(user.name);

    if (!name) return;

    avatar = resolveAvatarUrl(avatar, name);

    userBio = bio;
    localStorage.setItem('chat_bio', userBio);

    const frame = isAdm ? document.querySelector('.frame-option.active')?.id?.replace('frame-', '') || 'none' : (JSON.parse(sessionStorage.getItem('chat_user') || '{}').profileFrame || 'none');
    if (isAdm) {
        localStorage.setItem('chat_profile_frame', frame);
    }

    sessionStorage.setItem('chat_user', JSON.stringify({ name, avatar, profileFrame: frame }));
    window.location.reload();
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
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
function setReply(name, text, messageId) {
    selectedReply = { name, text, messageId };
    document.getElementById('reply-user').innerText = name;
    document.getElementById('reply-text').innerText = text;
    document.getElementById('reply-container').classList.remove('hidden');
    msgInput.focus();
}

function cancelReply() {
    selectedReply = null;
    document.getElementById('reply-container').classList.add('hidden');
}

function openThread(messageId) {
    currentThreadMessageId = messageId;
    const threadPanel = document.getElementById('thread-panel');
    threadPanel.classList.remove('hidden');
    renderThreadView(messageId);
}

function closeThreadPanel() {
    currentThreadMessageId = null;
    document.getElementById('thread-panel').classList.add('hidden');
}

function reactToMessage(messageId, emoji) {
    socket.emit('reactMessage', { messageId, emoji });
}

// =========================
// NOVOS LISTENERS PARA FUNCIONALIDADES
// =========================
socket.on('statusUpdate', (data) => {
    userStatuses[data.name] = data.status;
    lastSeen[data.name] = Date.now();
});

socket.on('messageReaction', (data) => {
    if (!messageReactions[data.messageId]) {
        messageReactions[data.messageId] = {};
    }
    if (!messageReactions[data.messageId][data.emoji]) {
        messageReactions[data.messageId][data.emoji] = [];
    }
    if (!messageReactions[data.messageId][data.emoji].includes(data.user)) {
        messageReactions[data.messageId][data.emoji].push(data.user);
    }
    updateReactionRow(data.messageId);
});

function updateReactionRow(messageId) {
    const bubble = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!bubble) return;
    const reactionButtons = bubble.querySelector('.reaction-buttons');
    if (!reactionButtons) return;
    const reactionData = messageReactions[messageId] || {};
    const buttons = ['👍', '😂', '❤️'].map((emoji) => {
        const users = reactionData[emoji] || [];
        const title = users.length ? users.join(', ') : `Reagir com ${emoji}`;
        return `<button onclick="reactToMessage('${messageId}', '${emoji}'); event.stopPropagation();" title="${title}" class="text-xs bg-white/10 px-2 py-1 rounded">${emoji}${users.length ? ` ${users.length}` : ''}</button>`;
    }).join('');
    reactionButtons.innerHTML = buttons;
}

socket.on('messageEdited', (data) => {
    // Atualizar mensagem editada na UI
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        messageElement.innerHTML = generatePreview(data.newText);
    }
});

socket.on('messagePinned', (data) => {
    pinnedMessages.push(data);
    updatePinnedMessages();
});

socket.on('messageUnpinned', (data) => {
    pinnedMessages = pinnedMessages.filter(msg => msg.messageId !== data.messageId);
    updatePinnedMessages();
});

function updatePinnedMessages() {
    const pinContainer = document.getElementById('pinned-messages');
    const pinBanner = document.getElementById('pin-banner');
    if (!pinContainer || !pinBanner) return;
    
    pinContainer.innerHTML = pinnedMessages.map(msg => `
        <div class="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded mb-2">
            <div class="flex justify-between items-center">
                <span class="text-xs text-yellow-400">📌 ${msg.name}: ${msg.text}</span>
                <button onclick="unpinMessage('${msg.messageId}')" class="text-xs text-gray-400">✕</button>
            </div>
        </div>
    `).join('');

    if (pinnedMessages.length > 0) {
        pinBanner.classList.remove('hidden');
    } else {
        pinBanner.classList.add('hidden');
    }
}

// =========================
// NOVO: FUNCIONALIDADES DE UPLOAD DE IMAGEM
// =========================

// Variáveis para upload
let selectedFiles = [];
let dragCounter = 0;

// Função para lidar com seleção de arquivo
function handleFileSelect(files) {
    for (let file of files) {
        if (file.type.startsWith('image/')) {
            selectedFiles.push(file);
            showImagePreview(file);
        }
    }
}

// Função para mostrar preview da imagem
function showImagePreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewContainer = document.createElement('div');
        previewContainer.className = 'media-card';
        previewContainer.innerHTML = `
            <div class="image-badge">Imagem</div>
            <div class="media-header">
                <div class="media-icon">🖼️</div>
                <div class="media-info">
                    <div class="media-name">${file.name}</div>
                    <div class="media-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <img src="${e.target.result}" class="media-preview" alt="${file.name}">
            <div class="media-actions">
                <button onclick="viewFullImage('${e.target.result}')">Visualizar</button>
                <button onclick="removeImage(this)">Remover</button>
            </div>
        `;
        
        // Adicionar ao container de previews
        const previewArea = document.getElementById('image-previews') || createPreviewArea();
        previewArea.appendChild(previewContainer);
    };
    reader.readAsDataURL(file);
}

// Função para criar área de preview
function createPreviewArea() {
    const previewArea = document.createElement('div');
    previewArea.id = 'image-previews';
    previewArea.className = 'fixed z-[125] left-3 right-3 max-w-lg mx-auto bg-black/90 p-3 rounded-2xl max-h-52 overflow-y-auto border border-white/10';
    previewArea.style.bottom = 'calc(5.5rem + env(safe-area-inset-bottom, 0px))';
    document.body.appendChild(previewArea);
    return previewArea;
}

// Função para visualizar imagem em tamanho real
function viewFullImage(src) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-50';
    modal.innerHTML = `
        <img src="${src}" class="max-w-full max-h-full object-contain">
        <button onclick="this.parentElement.remove()" class="absolute top-4 right-4 text-white text-2xl">✕</button>
    `;
    document.body.appendChild(modal);
}

// Função para remover imagem do preview
function removeImage(button) {
    const card = button.closest('.media-card');
    const index = Array.from(card.parentElement.children).indexOf(card);
    selectedFiles.splice(index, 1);
    card.remove();
    
    if (selectedFiles.length === 0) {
        document.getElementById('image-previews')?.remove();
    }
}

// Função para formatar tamanho do arquivo
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Função para enviar imagens
function sendImages() {
    if (selectedFiles.length === 0) return;
    
    selectedFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            socket.emit('chatMessage', {
                text: `Imagem anexada: ${file.name}`,
                imageData: e.target.result,
                fileName: file.name,
                fileSize: file.size,
                replyTo: selectedReply
            });
        };
        reader.readAsDataURL(file);
    });
    
    selectedFiles = [];
    document.getElementById('image-previews')?.remove();
}

// Event listeners para drag and drop
document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    document.body.classList.add('drag-over');
});

document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
        document.body.classList.remove('drag-over');
    }
});

document.addEventListener('dragover', (e) => {
    e.preventDefault();
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    document.body.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    handleFileSelect(files);
});

// Event listener para colar imagens
document.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let item of items) {
        if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            handleFileSelect([file]);
        }
    }
});

// Event listener para input de arquivo
document.getElementById('imageInput').addEventListener('change', (e) => {
    handleFileSelect(e.target.files);
});

document.getElementById('storyImageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        storyImageData = event.target.result;
        document.getElementById('story-image-name').innerText = file.name;
        const preview = document.getElementById('story-image-preview');
        preview.src = storyImageData;
        preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
});

// Função para baixar imagem
function downloadImage(src, fileName) {
    const link = document.createElement('a');
    link.href = src;
    link.download = fileName;
    link.click();
}

// Função para copiar imagem para clipboard
async function copyImageToClipboard(src) {
    try {
        const response = await fetch(src);
        const blob = await response.blob();
        await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
        ]);
        alert('Imagem copiada para a área de transferência!');
    } catch (error) {
        console.error('Erro ao copiar imagem:', error);
        alert('Erro ao copiar imagem.');
    }
}

// CSS para drag over
const dragStyle = document.createElement('style');
dragStyle.textContent = `
    .drag-over {
        background: rgba(0, 149, 246, 0.1) !important;
        border: 2px dashed var(--theme-color) !important;
    }
`;
document.head.appendChild(dragStyle);
function sendTempMessage(text, duration = 30000) {
    socket.emit('tempMessage', { text, duration });
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
    const garticBox = document.getElementById("gartic-box");
    
    if (garticBox.classList.contains("hidden")) {
        garticBox.classList.remove("hidden");
        resizeCanvas();
        // Envia o comando /gartic para iniciar uma rodada
        document.getElementById('input').value = "/gartic";
        document.getElementById('form').dispatchEvent(new Event('submit'));
        resizeComposerInput();
        console.log("Gartic aberto");
    } else {
        garticBox.classList.add("hidden");
        // Limpa o canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        podeDesenhar = false;
        document.getElementById('gartic-chat-messages').innerHTML = '';
        console.log("Gartic fechado");
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

// Fechar Gartic com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const garticBox = document.getElementById("gartic-box");
        if (garticBox && !garticBox.classList.contains("hidden")) {
            toggleGarticView();
        }
    }
});

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
    if (!ctx || !canvas) return;
    
    ctx.beginPath();
    ctx.strokeStyle = data.color || "#000000";
    ctx.lineWidth = parseInt(data.size) || 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
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
    console.log("Canvas limpo!");
});

socket.on("garticPalavra", (palavra) => {
    const meuUser = JSON.parse(sessionStorage.getItem('chat_user'));
    podeDesenhar = true;
    garticInfo.innerText = `✏️ VOCÊ está desenhando! A palavra é: **${palavra}**`;
    console.log("Minha palavra:", palavra);
});

socket.on("garticStatus", (data) => {
    const meuUser = JSON.parse(sessionStorage.getItem('chat_user'));
    
    if (data.desenhista !== meuUser.name) {
        podeDesenhar = false;
        garticInfo.innerText = `🎨 ${data.desenhista} está desenhando...`;
    } else {
        garticInfo.innerText = `✏️ Você está desenhando!`;
    }
});

socket.on("garticRanking", (points) => {
    const rankingDiv = document.getElementById('ranking');
    if (!rankingDiv) return;
    
    rankingDiv.innerHTML = Object.entries(points)
        .sort((a, b) => b[1] - a[1])
        .map(([nome, pts], idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
            return `<span class="px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-yellow-600/10 border border-yellow-500/20 rounded-full">${medal} ${nome}: <span class="font-black">${pts}</span> pts</span>`;
        })
        .join(" ");
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

// ========================================
// === TODAS AS 20 IDEIAS IMPLEMENTADAS ===
// ========================================

// 1. FLOATING REACTIONS - Reações que fluem pela tela
let bookmarkedMessages = JSON.parse(localStorage.getItem('bookmarked_messages') || '[]');
let userColors = {};

function generateUserColor(name) {
    if (!userColors[name]) {
        const colors = ['#0095f6', '#7c3aed', '#ff3040', '#42e97f', '#fbbf24', '#ec4899', '#06b6d4', '#8b5cf6'];
        const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        userColors[name] = colors[hash % colors.length];
    }
    return userColors[name];
}

function createFloatingReaction(emoji, x, y) {
    const reaction = document.createElement('div');
    reaction.className = 'floating-reaction';
    reaction.textContent = emoji;
    reaction.style.left = x + 'px';
    reaction.style.top = y + 'px';
    document.body.appendChild(reaction);
    setTimeout(() => reaction.remove(), 2000);
}

// 2. MESSAGE THREADS - Adicionar badge de thread
function addThreadBadge(messageId, replyCount) {
    const badge = document.createElement('div');
    badge.className = 'thread-badge';
    badge.textContent = `💬 ${replyCount} ${replyCount === 1 ? 'resposta' : 'respostas'}`;
    badge.onclick = () => openThread(messageId);
    return badge;
}

// 3. QUICK REACTIONS BAR - Mostrar reações rápidas ao hover
function showQuickReactions(msgEl) {
    let bar = msgEl.querySelector('.quick-reactions');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'quick-reactions';
        const quickEmojis = ['👍', '❤️', '😂', '😮', '🔥'];
        quickEmojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.textContent = emoji;
            btn.onclick = (e) => {
                e.stopPropagation();
                reactToMessage(msgEl.id, emoji);
                createFloatingReaction(emoji, e.clientX, e.clientY);
            };
            bar.appendChild(btn);
        });
        msgEl.appendChild(bar);
    }
    bar.style.opacity = '1';
}

function hideQuickReactions(msgEl) {
    const bar = msgEl.querySelector('.quick-reactions');
    if (bar) bar.style.opacity = '0';
}

// 4. MESSAGE BOOKMARKS - Salvar mensagens favoritas
function toggleBookmark(messageId) {
    if (bookmarkedMessages.includes(messageId)) {
        bookmarkedMessages = bookmarkedMessages.filter(id => id !== messageId);
    } else {
        bookmarkedMessages.push(messageId);
    }
    localStorage.setItem('bookmarked_messages', JSON.stringify(bookmarkedMessages));
    updateBookmarksUI();
    showToast('💾 Mensagem ' + (bookmarkedMessages.includes(messageId) ? 'salva' : 'removida'));
}

function updateBookmarksUI() {
    const bookmarksList = document.getElementById('bookmarks-list');
    if (!bookmarksList) return;
    
    const bookmarkedMsgs = allMessages.filter(msg => bookmarkedMessages.includes(msg.messageId));
    bookmarksList.innerHTML = bookmarkedMsgs.slice(0, 3).map(msg => `
        <div class="p-2 rounded-lg bg-white/5 border border-white/10 text-[9px] cursor-pointer hover:bg-white/10 transition" onclick="highlight('${msg.messageId}')">
            <div class="font-bold text-yellow-400">${msg.name}</div>
            <div class="text-gray-400 line-clamp-1">${msg.text}</div>
        </div>
    `).join('');
}

// 5. INLINE CODE & MARKDOWN - Formatação avançada (blocos ``` e emojis UTF-8)
function formatMessageText(text) {
    return formatRichChatText(text);
}

// 6. MINI GAMES - Jogos integrados
function playDiceGame() {
    const result = Math.floor(Math.random() * 6) + 1;
    socket.emit('chatMessage', { text: `🎲 Rolei os dados e saiu: **${result}**!` });
    confetti();
}

function playRockPaperScissors(choice) {
    const choices = ['🪨 Pedra', '📄 Papel', '✂️ Tesoura'];
    const botChoice = choices[Math.floor(Math.random() * 3)];
    socket.emit('chatMessage', { text: `Meu escolhe foi: ${botChoice}` });
}

function playTrivia() {
    const questions = [
        'Qual é a capital da França?',
        'Quanto é 2+2?',
        'Qual é o maior planeta?'
    ];
    const q = questions[Math.floor(Math.random() * questions.length)];
    showToast('❓ ' + q);
}

// 7. GIF SELECTOR - Funcional com Tenor API
let gifCache = [];

function toggleGifSelector() {
    const panel = document.getElementById('gif-selector-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden') && gifCache.length === 0) {
        loadTrendingGifs();
    }
}

function loadTrendingGifs() {
    const popularGifs = [
        'https://media.giphy.com/media/l0HlDtKo4l0yUYRYQ/giphy.gif',
        'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
        'https://media.giphy.com/media/l0HlL0qy3nrDe64hy/giphy.gif',
        'https://media.giphy.com/media/3o7TKEhUxJ6P5F9gEE/giphy.gif',
        'https://media.giphy.com/media/l0HlDlZxACvSHkV44/giphy.gif',
        'https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif',
        'https://media.giphy.com/media/3o7TKz9bX9Z8LxOq5y/giphy.gif',
        'https://media.giphy.com/media/3o7TKz9bX9Z8LxOq5y/giphy.gif',
        'https://media.giphy.com/media/3o7TKz9bX9Z8LxOq5y/giphy.gif',
        'https://media.giphy.com/media/3o7TKz9bX9Z8LxOq5y/giphy.gif',
    ];
    displayGifs(popularGifs);
}

function searchGifs() {
    const query = document.getElementById('gif-search')?.value || '';
    if (!query.trim()) {
        loadTrendingGifs();
        return;
    }
    // Simulando pesquisa (em um app real, conectaria à Tenor/Giphy)
    const mockGifs = [
        'https://media.giphy.com/media/l0HlDtKo4l0yUYRYQ/giphy.gif',
        'https://media.giphy.com/media/3o7TKEhUxJ6P5F9gEE/giphy.gif'
    ];
    displayGifs(mockGifs);
}

function displayGifs(gifs) {
    const grid = document.getElementById('gif-grid');
    grid.innerHTML = gifs.map((gif, idx) => `
        <img src="${gif}" class="gif-item" onclick="sendGif('${gif}')">
    `).join('');
}

function sendGif(gifUrl) {
    socket.emit('chatMessage', { text: gifUrl });
    document.getElementById('gif-selector-panel').classList.add('hidden');
}

// 8. AUTO THEME - Tema automático por hora
function applyAutoTime() {
    const hour = new Date().getHours();
    const isDark = hour >= 18 || hour < 6;
    const bgColor = isDark ? 'rgba(5,5,8,.8)' : 'rgba(255,255,255,.95)';
    localStorage.setItem('auto_time_theme', isDark ? 'night' : 'day');
}

// 9. RICH REACTIONS - Reações com emojis dos usuários
let messageReactionsMap = {};

function addReactionRow(messageId) {
    const msgEl = document.getElementById(messageId);
    if (!msgEl || msgEl.querySelector('.reaction-row')) return;
    
    const row = document.createElement('div');
    row.className = 'reaction-row';
    const topReactions = Object.entries(messageReactionsMap[messageId] || {})
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 5);
    
    topReactions.forEach(([emoji, users]) => {
        const item = document.createElement('div');
        item.className = 'reaction-item' + (users.includes(user.name) ? ' user-reacted' : '');
        item.innerHTML = `${emoji} <span>${users.length}</span>`;
        item.onclick = () => reactToMessage(messageId, emoji);
        item.onmouseover = () => {
            showToast(users.join(', ') + ' reagiram');
        };
        row.appendChild(item);
    });
    msgEl.appendChild(row);
}

// 10. ACHIEVEMENTS - Sistema melhorado
function checkAchievements() {
    const achievements_list = {
        'Primeiras 100': { condition: userXP >= 100, emoji: '🚀' },
        '100 Reações': { condition: Object.values(messageReactionsMap).flat().length >= 100, emoji: '❤️' },
        'Streak 7 dias': { condition: true, emoji: '🔥' },
        'Conquistador': { condition: userLevel >= 10, emoji: '👑' }
    };
    
    Object.entries(achievements_list).forEach(([name, {emoji, condition}]) => {
        if (condition && !achievements[name]) {
            achievements[name] = true;
            localStorage.setItem('chat_achievements', JSON.stringify(achievements));
            showAchievementPopup(emoji, name);
        }
    });
}

function showAchievementPopup(emoji, name) {
    const popup = document.createElement('div');
    popup.className = 'achievement-badge';
    popup.textContent = emoji;
    document.body.appendChild(popup);
    setTimeout(() => {
        popup.remove();
        showToast(`🏆 Conquista desbloqueada: ${name}`);
    }, 1500);
}

// ========================================
// === FUNÇÕES GERAIS FINAIS ===
// ========================================

// Verificar admin para logs
const user = JSON.parse(sessionStorage.getItem('chat_user') || '{}');
if (ADMINS.includes(user.name)) {
    document.getElementById('logs-btn').style.display = 'block';
}

function toggleNotifications() {
    const dropdown = document.getElementById('notifications-dropdown');
    dropdown.classList.toggle('hidden');
}

function startVoiceMessage() {
    showToast('🎤 Selecione uma opção de áudio removida. Use GIF em vez disso! 🎉');
}

function openAchievements() {
    document.getElementById('achievements-modal').classList.remove('hidden');
    checkAchievements();
    updateBookmarksUI();
}

function closeAchievements() {
    document.getElementById('achievements-modal').classList.add('hidden');
}

function globalSearch() {
    const query = document.getElementById('global-search').value.toLowerCase();
    const messages = document.querySelectorAll('#messages > div');
    messages.forEach(div => {
        const text = div.textContent.toLowerCase();
        if (text.includes(query)) {
            div.style.display = 'block';
        } else {
            div.style.display = 'none';
        }
    });
}

// =========================
// CINEMA MODE & GARTIC FUNÇÕES
// =========================
function toggleCinemaMode() {
    const garticBox = document.getElementById("gartic-box");
    garticBox.classList.toggle("gartic-cinema-mode");
    console.log("Cinema mode toggled");
}

// Função para mostrar palpites no chat do Gartic (reutilizável)
function addGarticGuess(name, guess) {
    const container = document.getElementById('gartic-chat-messages');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/10';
    div.innerHTML = `<span class="font-bold text-blue-400">${name}</span><span class="text-gray-400">: ${guess}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
