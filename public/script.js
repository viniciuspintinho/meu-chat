const socket = io();
const msgContainer = document.getElementById('messages');
const msgInput = document.getElementById('input');
const facepileDiv = document.getElementById('facepile');
const ADMIN_NAME = "vn7";

let selectedReply = null;
let lastSenderId = null;

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

function processCommand(val) {
    const myName = JSON.parse(sessionStorage.getItem('chat_user')).name;
    const args = val.split(' ');
    const cmd = args[0].toLowerCase();
    const target = args.slice(1).join(' ');
    let res = { text: "", type: "normal" };

    if(cmd === '/love') res.text = `❤️ Nível de amor entre **${myName}** e **${target}**: ${Math.floor(Math.random()*101)}%`;
    else if(cmd === '/bater') res.text = `👊 **${myName}** deu uma bofetada em **${target}**!`;
    else if(cmd === '/abrace') res.text = `🫂 **${myName}** abraçou **${target}**!`;
    else if(cmd === '/moeda') res.text = `🪙 Girou a moeda e deu: **${Math.random() > 0.5 ? "CARA" : "COROA"}**!`;
    else if(cmd === '/dado') res.text = `🎲 Jogou o dado e tirou: **${Math.floor(Math.random()*6)+1}**!`;
    else if(cmd === '/aviso' && myName === ADMIN_NAME) res.text = `⚠️ **AVISO:** ${target}`;
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
    msgInput.value = '';
    selectedReply = null;
    document.getElementById('reply-container').classList.add('hidden');
};

socket.on('message', (data) => {
    const isMe = data.id === socket.id;
    const myName = JSON.parse(sessionStorage.getItem('chat_user') || "{}").name;
    const isSequencial = (data.id === lastSenderId);
    lastSenderId = data.id;

    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full ${isSequencial ? 'mt-0.5' : 'mt-4'}`;

    let bubbleStyle = isMe ? 'bubble-me rounded-2xl' : 'bg-white/10 rounded-2xl border border-white/5 backdrop-blur-sm';
    if(isMe && !isSequencial) bubbleStyle += ' rounded-br-none';
    if(!isMe && !isSequencial) bubbleStyle += ' rounded-bl-none';
    if(data.text.includes(`@${myName}`)) bubbleStyle += ' bg-yellow-500/20 border-yellow-500/50';

    let txt = data.text.replace(/@(\w+)/g, '<span class="text-blue-400 font-bold">@$1</span>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    let content = data.text.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? `<img src="${data.text}" class="max-w-xs rounded-lg">` : `<p class="text-sm">${txt}</p>`;
    if(data.msgType === "letreiro") content = `<div class="letreiro-msg">${data.text}</div>`;

    div.innerHTML = `
        <div class="flex gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : ''} items-end group">
            ${isSequencial ? '<div class="w-8"></div>' : `<img src="${data.avatar}" class="w-8 h-8 rounded-full">`}
            <div class="flex flex-col ${isMe ? 'items-end' : ''}">
                ${isSequencial ? '' : `<span class="text-[10px] text-gray-500 ${data.name === ADMIN_NAME ? 'adm-name' : ''}">${data.name}</span>`}
                <div class="px-4 py-2 ${bubbleStyle}">
                    ${data.replyTo ? `<div class="text-[9px] opacity-60 border-l p-1 mb-1"><b>${data.replyTo.name}</b>: ${data.replyTo.text}</div>` : ''}
                    ${content}
                </div>
            </div>
        </div>
    `;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

socket.on('updateUserList', (users) => {
    // Atualiza Lista Lateral
    document.getElementById('user-list').innerHTML = users.map(u => `
        <div class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition">
            <img src="${u.avatar}" class="w-8 h-8 rounded-full">
            <span class="text-xs ${u.name === ADMIN_NAME ? 'adm-name' : 'text-gray-300'}">${u.name}</span>
        </div>
    `).join('');

    // Atualiza Facepile (Item 5)
    const limit = 4;
    const displayed = users.slice(0, limit);
    const more = users.length - limit;
    
    facepileDiv.innerHTML = displayed.map((u, i) => `
        <img src="${u.avatar}" class="face-item" style="z-index: ${10 - i}" title="${u.name}">
    `).join('') + (more > 0 ? `<div class="face-more">+${more}</div>` : '');
});

// Outras funções (Settings, Foto, etc) mantidas igual...
function openSettings() { document.getElementById('settings-modal').classList.remove('hidden'); }
function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }
function logout() { sessionStorage.removeItem('chat_user'); window.location.reload(); }
function setReply(name, text) { 
    selectedReply = { name, text }; 
    document.getElementById('reply-user').innerText = name;
    document.getElementById('reply-text').innerText = text;
    document.getElementById('reply-container').classList.remove('hidden');
}
function cancelReply() { selectedReply = null; document.getElementById('reply-container').classList.add('hidden'); }
function enviarFoto() { const url = prompt("Link da foto:"); if(url) socket.emit('chatMessage', { text: url, replyTo: selectedReply }); }