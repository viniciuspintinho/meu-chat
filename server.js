const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Define a pasta public para servir o HTML, CSS e JS
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('Novo usuário conectado:', socket.id);

    // Quando o usuário entra, salvamos os dados dele na sessão do socket
    socket.on('join', (data) => {
        socket.userData = data;
        console.log(`${data.name} entrou no chat.`);
    });

    // Quando o servidor recebe uma mensagem
    socket.on('chatMessage', (msg) => {
        if (socket.userData) {
            io.emit('message', {
                name: socket.userData.name,
                avatar: socket.userData.avatar,
                text: msg,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                id: socket.id
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Usuário desconectado');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor rodando em http://localhost:${PORT}`));