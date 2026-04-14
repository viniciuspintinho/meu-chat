const socket = io();
const loginDiv = document.getElementById('login');
const msgContainer = document.getElementById('messages');

function entrar() {
    const name = document.getElementById('username').value;
    const avatar = document.getElementById('avatar').value || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
    if(name) {
        socket.emit('join', { name, avatar });
        loginDiv.classList.add('hidden');
    }
}

document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('input');
    if (input.value) {
        socket.emit('chatMessage', input.value);
        input.value = '';
    }
};

socket.on('message', (data) => {
const isMe = data.id === socket.id;
    const div = document.createElement('div');
    div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'}`;
    div.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <img src="${data.avatar}" class="w-6 h-6 rounded-full">
            <span class="text-xs text-gray-400">${data.name}</span>
        </div>
        <div class="p-3 rounded-lg max-w-[80%] ${isMe ? 'bg-[#005c4b]' : 'bg-[#202c33]'}">
            <p>${data.text}</p>
            <span class="text-[10px] text-gray-400 mt-1 block text-right">${data.time}</span>
        </div>
    `;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
});