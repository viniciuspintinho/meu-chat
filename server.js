const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let usersOnline = {}; // Objeto para guardar usuários: { socketId: { name, avatar } }

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        usersOnline[socket.id] = data;
        io.emit('updateUserList', Object.values(usersOnline)); // Envia lista atualizada
    });

    socket.on('typing', (isTyping) => {
        if (usersOnline[socket.id]) {
            socket.broadcast.emit('displayTyping', {
                name: usersOnline[socket.id].name,
                typing: isTyping
            });
        }
    });

    socket.on('chatMessage', (msg) => {
        if (usersOnline[socket.id]) {
            io.emit('message', {
                ...usersOnline[socket.id],
                text: msg,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                id: socket.id
            });
        }
    });

    socket.on('disconnect', () => {
        delete usersOnline[socket.id];
        io.emit('updateUserList', Object.values(usersOnline));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Futurismo ON na porta ${PORT}`));