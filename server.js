const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_NAME = "vn7"; 
let usersOnline = {}; 

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        const isAuthor = data.name === ADMIN_NAME;
        usersOnline[socket.id] = { 
            name: data.name, 
            avatar: data.avatar,
            id: socket.id,
            isAdmin: isAuthor,
            isCreator: isAuthor
        };
        io.emit('updateUserList', Object.values(usersOnline));
    });

    socket.on('chatMessage', (data) => {
        const user = usersOnline[socket.id];
        if (user) {
            io.emit('message', {
                name: user.name,
                avatar: user.avatar,
                text: data.text,
                msgType: data.msgType || "normal",
                replyTo: data.replyTo || null,
                isAdmin: user.isAdmin,
                isCreator: user.isCreator,
                id: socket.id 
            });
        }
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