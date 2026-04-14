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
        usersOnline[socket.id] = { 
            name: data.name, 
            avatar: data.avatar,
            id: socket.id 
        };
        socket.broadcast.emit('systemMessage', `${data.name} entrou no chat`);
        io.emit('updateUserList', Object.values(usersOnline));
    });

    socket.on('chatMessage', (data) => {
        const user = usersOnline[socket.id];
        if (user) {
            io.emit('message', {
                name: user.name,
                avatar: user.avatar,
                text: data.text,
                replyTo: data.replyTo || null, // Adicionado aqui
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                id: socket.id 
            });
        }
    });

    socket.on('disconnect', () => {
        if (usersOnline[socket.id]) {
            const userName = usersOnline[socket.id].name;
            socket.broadcast.emit('systemMessage', `${userName} saiu do chat`);
            delete usersOnline[socket.id];
            io.emit('updateUserList', Object.values(usersOnline));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Lux Chat Online`));