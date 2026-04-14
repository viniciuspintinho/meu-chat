const socket = io();
const msgContainer = document.getElementById('messages');
const msgInput = document.getElementById('input');
const replyContainer = document.getElementById('reply-container');
const ADMIN_NAME = "vn7";

let selectedReply = null;
let lastSenderId = null;
let windowFocused = true;
let unreadCount = 0;

// Notificações na aba
window.onfocus = () => { windowFocused = true; unreadCount = 0; document.title = "Lux Chat Pro"; };
window.onblur = () => { windowFocused = false; };

function applyTheme(hex) {
    document.documentElement.style.setProperty('--theme-color', hex);
    localStorage.setItem('chat_theme_color', hex);
}

window.onload = () => {
    const sessionUser = sessionStorage.getItem('chat_user');
    applyTheme(localStorage.getItem('chat_theme_color') || '#0095f6');
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

function openSettings() {
    const userData = JSON.parse(sessionStorage.getItem('chat_user'));
    document.getElementById('set-username').value = userData.name;
    document.getElementById('set-avatar').value = userData.avatar;
    document.getElementById('settings-modal').classList.remove('hidden');
}
function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }
function changeTheme(hex) { applyTheme(hex); }
function logout() { sessionStorage.removeItem('chat_user'); window.location.reload(); }
function saveSettings() {
    const name = document.getElementById('set-username').value.trim();
    const avatar = document.getElementById('set-avatar').value.trim();
    if(name) {
        sessionStorage.setItem('chat_user', JSON.stringify({ name, avatar }));
        window.location.reload();
    }
}

// Comandos
function processCommand(inputText) {
    const userData = JSON.parse(sessionStorage.getItem('chat_user') || "{}");
    const isAdm = userData.name === ADMIN_NAME;
    const args = inputText.split(' ');
    const command = args[0].toLowerCase();
    const target = args.slice(1).join(' ');

    let res = { text: "", type: "normal" };
    if (command === '/love') res.text = `❤️ Amor entre **${userData.name}** e **${target}**: ${Math.floor(Math.random()*101)}%`;
    else if (command === '/bater') res.text = `👊 **${userData.name}** bateu em **${target}**!`;
    else if (command === '/abrace') res.text = `🫂 **${userData.name}** abraçou **${target}**!`;
    else if (command === '/moeda') res.text = `🪙 Deu **${Math.random() > 0.5 ? "CARA" : "COROA"}**!`;
    else if (command === '/dado') res.text = `🎲 Tirou **${Math.floor(Math.random()*6)+1}**!`;
    else if (command === '/aviso' && isAdm) res.text = `⚠️ **AVISO:** ${target}`;
    else if (command === '/letreiro') { res.text = target; res.type = "letreiro"; }
    else return inputText;
    
    return res;
}

function setReply(name, text) {
    selectedReply = { name, text };
    document.getElementById('reply-user').innerText = name;
    document.getElementById('reply-text').innerText = text;
    replyContainer.classList.remove('hidden');
    msgInput.focus();
}
function cancelReply() { selectedReply = null; replyContainer.classList.add('hidden'); }
function enviarFoto() {
    const url = prompt("Link da imagem:");
    if(url) socket.emit('chatMessage', { text: url, replyTo: selectedReply });
}

document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    const val = msgInput.value.trim();
    if(!val) return;
    const cmd = processCommand(val);
    const payload = typeof cmd === 'object' ? { text: cmd.text, msgType: cmd.type, replyTo: selectedReply } : { text: val, replyTo: selectedReply };
    socket.emit('chatMessage', payload);
    msgInput.value = '';
    cancelReply();
};

socket.on('message', (data) => {
    const isMe = data.id === socket.id;
    const myName = JSON.parse(sessionStorage.getItem('chat_user') || "{}").name;
    const isMention = data.text.includes(`@${myName}`) && !isMe;
    
    if(!windowFocused) { unreadCount++; document.title = `(${unreadCount}) Mensagens`; }

    const isSequencial = (data.id === lastSenderId);
    lastSenderId = data.id;

    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full message-animation ${isSequencial ? 'mt-0.5' : 'mt-3'}`;

    const isImg = data.text.match(/\.(jpeg|jpg|gif|png|webp)$/i);
    let bubbleStyle = isMe ? 'bubble-me rounded-2xl' : 'bg-[#262626] rounded-2xl border border-[#333]';
    if(isMe && !isSequencial) bubbleStyle += ' rounded-br-none bubble-glow';
    if(!isMe && !isSequencial) bubbleStyle += ' rounded-bl-none';
    if(isMention) bubbleStyle += ' mention-me';

    let txt = data.text.replace(/@(\w+)/g, '<span class="mention-text">@$1</span>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    let content = isImg ? `<img src="${data.text}" class="max-w-xs rounded-lg">` : `<p class="text-sm">${txt}</p>`;
    if(data.msgType === "letreiro") content = `<div class="letreiro-msg">${data.text}</div>`;

    let reply = data.replyTo ? `<div class="bg-black/20 p-2 mb-1 rounded text-[10px] opacity-70"><b>${data.replyTo.name}</b>: ${data.replyTo.text}</div>` : '';

    div.innerHTML = `
        <div class="flex gap-2 max-w-[80%] ${isMe ? 'flex-row-reverse' : ''} items-end group">
            ${isSequencial ? '<div class="w-8"></div>' : `<img src="${data.avatar}" class="w-8 h-8 rounded-full border ${data.name === ADMIN_NAME ? 'border-yellow-500' : 'border-transparent'}">`}
            <div class="flex flex-col ${isMe ? 'items-end' : ''}">
                ${isSequencial ? '' : `<span class="text-[10px] text-gray-500 mb-0.5 ${data.name === ADMIN_NAME ? 'adm-name' : ''}">${data.name === ADMIN_NAME ? '[ADM] ' : ''}${data.name}</span>`}
                <div class="px-4 py-2 ${bubbleStyle}">
                    ${reply} ${content}
                </div>
                <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                    <span class="text-[8px] text-gray-600">${data.time}</span>
                    <button onclick="setReply('${data.name}', '${data.text}')" class="text-[8px] text-gray-400 font-bold">RESPONDER</button>
                </div>
            </div>
        </div>
    `;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

socket.on('updateUserList', (users) => {
    document.getElementById('user-list').innerHTML = users.map(u => `
        <div class="flex items-center gap-3 p-2">
            <img src="${u.avatar}" class="w-8 h-8 rounded-full border ${u.name === ADMIN_NAME ? 'border-yellow-500' : 'border-transparent'}">
            <span class="text-xs ${u.name === ADMIN_NAME ? 'adm-name' : 'text-gray-300'}">${u.name}</span>
        </div>
    `).join('');
});

socket.on('systemMessage', (m) => {
    const d = document.createElement('div'); d.className = 'system-msg'; d.innerText = m;
    msgContainer.appendChild(d);
});