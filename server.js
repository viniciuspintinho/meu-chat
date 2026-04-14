const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let usersOnline = {}; 

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        usersOnline[socket.id] = { ...data, id: socket.id };
        io.emit('updateUserList', Object.values(usersOnline));
    });

    socket.on('typing', (isTyping) => {
        if (usersOnline[socket.id]) {
            socket.broadcast.emit('displayTyping', {
                name: usersOnline[socket.id].name,
                typing: isTyping
            });
        }
    });

    socket.on('chatMessage', (data) => {
        if (usersOnline[socket.id]) {
            io.emit('message', {
                name: usersOnline[socket.id].name,
                avatar: usersOnline[socket.id].avatar,
                text: data.text,
                replyTo: data.replyTo || null,
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
server.listen(PORT, () => console.log(`🚀 Lux Chat Online`));