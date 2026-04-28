const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Lista de administradores
const ADMINS = ["vn7", "pl"]; 

let usersOnline = {}; 
let bannedUsers = new Set(); 

// Filtro de palavras
const badWords = ["palavrao1", "palavrao2", "toxic"];
const filterText = (text) => {
    let cleaned = text;
    badWords.forEach(word => {
        const reg = new RegExp(word, "gi");
        cleaned = cleaned.replace(reg, "****");
    });
    return cleaned;
};

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        if (bannedUsers.has(data.name)) {
            socket.emit('message', { name: "SISTEMA", text: "Você está banido deste chat.", msgType: "normal" });
            return socket.disconnect();
        }

        const isAuthor = ADMINS.includes(data.name);

        usersOnline[socket.id] = { 
            name: data.name, 
            avatar: data.avatar,
            id: socket.id,
            isAdmin: isAuthor,
            isCreator: isAuthor
        };

        io.emit('updateUserList', Object.values(usersOnline));
        
        socket.broadcast.emit('message', { 
            name: "Lux Bot", 
            text: `✨ **${data.name}** entrou no canal!`, 
            msgType: "normal",
            id: "bot"
        });
    });

    socket.on('chatMessage', (data) => {
        const user = usersOnline[socket.id];
        if (!user) return;

        const cleanText = filterText(data.text);

        if (data.isPrivate && data.targetId) {
            io.to(data.targetId).emit('message', {
                name: `(Privado) ${user.name}`,
                avatar: user.avatar,
                text: cleanText,
                msgType: "normal",
                id: socket.id,
                isPrivate: true
            });
            return;
        }

        // Comandos de Admin
        if (user.isAdmin) {
            if (data.text.startsWith('/kick ')) {
                const targetName = data.text.replace('/kick ', '').trim();
                const targetSocketId = Object.keys(usersOnline).find(id => usersOnline[id].name === targetName);
                if (targetSocketId) io.to(targetSocketId).emit('forceDisconnect', 'Você foi expulso do chat.');
                return;
            }

            if (data.text.startsWith('/ban ')) {
                const targetName = data.text.replace('/ban ', '').trim();
                bannedUsers.add(targetName);
                const targetSocketId = Object.keys(usersOnline).find(id => usersOnline[id].name === targetName);
                if (targetSocketId) io.to(targetSocketId).emit('forceDisconnect', 'Você foi banido permanentemente.');
                return;
            }

            if (data.text.startsWith('/unban ')) {
                const target = data.text.replace('/unban ', '').trim();
                if (bannedUsers.has(target)) {
                    bannedUsers.delete(target);
                    socket.emit('message', { name: "SISTEMA", text: `Usuário ${target} foi desbanido.` });
                }
                return;
            }
        }

        io.emit('message', {
            name: user.name,
            avatar: user.avatar,
            text: cleanText,
            msgType: data.msgType || "normal",
            replyTo: data.replyTo || null,
            isAdmin: user.isAdmin,
            id: socket.id 
        });
    });

    socket.on('typing', (isTyping) => {
        const user = usersOnline[socket.id];
        if(user) socket.broadcast.emit('displayTyping', { name: user.name, typing: isTyping });
    });

    socket.on('disconnect', () => {
        if (usersOnline[socket.id]) {
            delete usersOnline[socket.id];
            io.emit('updateUserList', Object.values(usersOnline));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Lux Chat Online | Port: ${PORT}`));