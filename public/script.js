const socket = io();
const loginDiv = document.getElementById('login');
const msgContainer = document.getElementById('messages');
const userListDiv = document.getElementById('user-list');
const msgInput = document.getElementById('input');
const replyContainer = document.getElementById('reply-container');

const ADMIN_NAME = "vn7"; 
let selectedReply = null;
let windowFocused = true;
let unreadCount = 0;

window.onfocus = () => { windowFocused = true; unreadCount = 0; document.title = "Lux Chat Pro"; };
window.onblur = () => { windowFocused = false; };

function applyTheme(hex) {
    document.documentElement.style.setProperty('--theme-color', hex);
    localStorage.setItem('chat_theme_color', hex);
    document.querySelectorAll('.theme-dot').forEach(dot => {
        dot.classList.remove('active');
        if(dot.style.backgroundColor === hex || dot.getAttribute('style').includes(hex)) dot.classList.add('active');
    });
}

window.onload = () => {
    const sessionUser = sessionStorage.getItem('chat_user');
    const savedColor = localStorage.getItem('chat_theme_color') || '#0095f6';
    applyTheme(savedColor);
    if (sessionUser) {
        socket.emit('join', JSON.parse(sessionUser));
        loginDiv.classList.add('hidden');
    }
};

function entrar() {
    const name = document.getElementById('username').value.trim();
    const avatar = document.getElementById('avatar').value.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
    if(name) {
        const userData = { name, avatar };
        sessionStorage.setItem('chat_user', JSON.stringify(userData));
        socket.emit('join', userData);
        loginDiv.classList.add('hidden');
    }
}

function logout() { sessionStorage.removeItem('chat_user'); window.location.reload(); }
function openSettings() {
    const userData = JSON.parse(sessionStorage.getItem('chat_user'));
    document.getElementById('set-username').value = userData.name;
    document.getElementById('set-avatar').value = userData.avatar;
    document.getElementById('settings-modal').classList.remove('hidden');
}
function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }
function changeTheme(hex) { applyTheme(hex); }
function saveSettings() {
    const name = document.getElementById('set-username').value.trim();
    const avatar = document.getElementById('set-avatar').value.trim();
    if(name) {
        sessionStorage.setItem('chat_user', JSON.stringify({ name, avatar }));
        window.location.reload();
    }
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
    const url = prompt("Insira o link da imagem:");
    if (url && url.trim() !== "") {
        socket.emit('chatMessage', { text: url, replyTo: selectedReply });
        cancelReply();
    }
}

// LÓGICA DE COMANDOS
function processCommand(inputText) {
    const userData = JSON.parse(sessionStorage.getItem('chat_user') || "{}");
    const isAdm = userData.name === ADMIN_NAME;
    const args = inputText.split(' ');
    const command = args[0].toLowerCase();
    const target = args.slice(1).join(' ');

    let resultText = "";
    let type = "normal";

    switch(command) {
        case '/love':
            const love = Math.floor(Math.random() * 101);
            resultText = `❤️ O nível de amor entre **${userData.name}** e **${target || 'alguém'}** é de **${love}%**!`;
            break;
        case '/bater':
            resultText = `👊 **${userData.name}** deu uma bofetada em **${target || 'si mesmo'}**!`;
            break;
        case '/abrace':
            resultText = `🫂 **${userData.name}** deu um abraço carinhoso em **${target || 'alguém'}**!`;
            break;
        case '/abracao':
            resultText = `🫂✨ **${userData.name}** deu um ABRAÇO GIGANTE em **${target || 'todos'}**!`;
            break;
        case '/moeda':
            const face = Math.random() > 0.5 ? "CARA" : "COROA";
            resultText = `🪙 **${userData.name}** girou a moeda e deu: **${face}**!`;
            break;
        case '/dado':
            const dado = Math.floor(Math.random() * 6) + 1;
            resultText = `🎲 **${userData.name}** jogou o dado e tirou: **${dado}**!`;
            break;
        case '/casar':
            resultText = `💍 **${userData.name}** pediu a mão de **${target || 'alguém'}** em casamento!`;
            break;
        case '/aviso':
            if(!isAdm) return null;
            resultText = `⚠️ **AVISO DO ADM:** ${target}`;
            break;
        case '/letreiro':
            resultText = target;
            type = "letreiro";
            break;
        default:
            return inputText; // Não é comando
    }
    return { text: resultText, type: type };
}

document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    const rawText = msgInput.value.trim();
    if (rawText !== "") {
        const commandResult = processCommand(rawText);
        
        if (commandResult === null) {
            alert("Apenas o ADM pode usar este comando!");
        } else if (typeof commandResult === 'object') {
            socket.emit('chatMessage', { 
                text: commandResult.text, 
                replyTo: selectedReply,
                msgType: commandResult.type 
            });
        } else {
            socket.emit('chatMessage', { text: rawText, replyTo: selectedReply });
        }
        
        msgInput.value = '';
        cancelReply();
    }
};

socket.on('message', (data) => {
    const isMe = data.id === socket.id;
    const userData = JSON.parse(sessionStorage.getItem('chat_user') || "{}");
    const myName = userData.name || "";
    const isMentioned = data.text.includes(`@${myName}`) && !isMe;
    
    if (!windowFocused) {
        unreadCount++;
        document.title = `(${unreadCount}) Novas Mensagens | Lux`;
    }

    const senderIsAdmin = data.name === ADMIN_NAME;
    const isImage = data.text.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null;

    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} w-full mb-3 px-2`;
    
    const displayName = senderIsAdmin ? `[ADM] ${data.name}` : data.name;
    const badge = senderIsAdmin ? `<span class="badge-criador">CRIADOR</span>` : '';
    
    let bubbleStyle = isMe ? 'bubble-me rounded-tr-none' : 'bg-[#262626] text-gray-100 rounded-tl-none border border-[#333]';
    if (isMentioned) bubbleStyle += ' mention-me';

    let processedText = data.text.replace(/@(\w+)/g, '<span class="mention-text">@$1</span>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    let contentHtml = isImage ? `<img src="${data.text}" class="max-w-full rounded-lg shadow-md" style="max-height: 250px;">` : `<p class="text-sm">${processedText}</p>`;

    // Se for comando letreiro
    if(data.msgType === "letreiro") {
        contentHtml = `<div class="letreiro-msg">${data.text}</div>`;
    }

    let replyHtml = data.replyTo ? `
        <div class="bg-black/20 border-l-2 border-white/30 p-2 mb-2 rounded text-[11px] opacity-80">
            <p class="font-bold">${data.replyTo.name}</p>
            <p class="truncate max-w-[200px]">${data.replyTo.text}</p>
        </div>
    ` : '';

    div.innerHTML = `
        <div class="flex gap-3 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end group">
            <img src="${data.avatar}" class="w-8 h-8 rounded-full border ${senderIsAdmin ? 'border-yellow-500' : 'border-transparent'}">
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <div class="flex items-center mb-1">
                    <span class="text-[10px] ${senderIsAdmin ? 'adm-name' : 'text-gray-500'} font-semibold">${displayName}</span>
                    ${badge}
                </div>
                <div class="px-5 py-3 rounded-[24px] ${bubbleStyle} relative">
                    ${replyHtml}
                    ${contentHtml}
                </div>
                <div class="flex items-center gap-2 mt-1 px-2">
                    <span class="text-[8px] text-gray-600 transition group-hover:opacity-100">${data.time}</span>
                    <button onclick="setReply('${data.name}', '${data.text.replace(/'/g, "\\'")}')" class="text-[9px] text-gray-400 font-bold hover:text-white opacity-0 group-hover:opacity-100 transition">RESPONDER</button>
                </div>
            </div>
        </div>
    `;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

socket.on('systemMessage', (msg) => {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.innerText = msg;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

socket.on('updateUserList', (users) => {
    userListDiv.innerHTML = users.map(u => {
        const isAdm = u.name === ADMIN_NAME;
        return `
            <div class="flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl transition">
                <img src="${u.avatar}" class="w-10 h-10 rounded-full border-2 ${isAdm ? 'border-yellow-500' : 'border-transparent'}">
                <span class="text-sm ${isAdm ? 'adm-name' : 'text-gray-300'} font-bold">${isAdm ? '[ADM] ' : ''}${u.name}</span>
            </div>
        `;
    }).join('');
});