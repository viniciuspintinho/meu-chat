const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

/* =========================
   CONFIG CHAT ORIGINAL
========================= */

const ADMINS = ["vn7", "pl"];

let usersOnline = {};
let bannedUsers = new Set();

const badWords = ["palavrao1", "palavrao2", "toxic"];

function filterText(text) {
    let cleaned = text;

    badWords.forEach(word => {
        const reg = new RegExp(word, "gi");
        cleaned = cleaned.replace(reg, "****");
    });

    return cleaned;
}

/* =========================
   CONFIG GARTIC
========================= */

const palavras = [
    "cachorro",
    "gato",
    "banana",
    "carro",
    "computador",
    "pizza",
    "telefone",
    "foguete",
    "aviao",
    "casa",
    "flor",
    "bicicleta"
];

let gartic = {
    ativo: false,
    palavra: "",
    drawer: "",
    drawerId: "",
    hint: "",
    points: {}
};

function embaralharUsuarios() {
    return Object.values(usersOnline);
}

function gerarHint(palavra) {
    return palavra
        .split("")
        .map(() => "_")
        .join(" ");
}

function iniciarRodada() {
    const lista = embaralharUsuarios();

    if (lista.length === 0) return;

    const sorteado = lista[Math.floor(Math.random() * lista.length)];
    const palavra = palavras[Math.floor(Math.random() * palavras.length)];

    gartic.ativo = true;
    gartic.drawer = sorteado.name;
    gartic.drawerId = sorteado.id;
    gartic.palavra = palavra;
    gartic.hint = gerarHint(palavra);

    io.emit("clearCanvas");

    io.emit("garticState", {
        drawer: gartic.drawer,
        hint: gartic.hint,
        points: gartic.points
    });

    io.to(gartic.drawerId).emit("message", {
        name: "Lux Bot",
        text: `🎨 Sua palavra é: **${gartic.palavra}**`,
        id: "bot"
    });

    io.emit("message", {
        name: "Lux Bot",
        text: `🎮 Novo Gartic iniciado! ${gartic.drawer} está desenhando.`,
        id: "bot"
    });
}

/* =========================
   SOCKET
========================= */

io.on("connection", (socket) => {

    socket.on("join", (data) => {

        if (bannedUsers.has(data.name)) {
            socket.emit("message", {
                name: "SISTEMA",
                text: "Você está banido deste chat."
            });

            return socket.disconnect();
        }

        const isAdmin = ADMINS.includes(data.name);

        usersOnline[socket.id] = {
            id: socket.id,
            name: data.name,
            avatar: data.avatar,
            isAdmin
        };

        if (!gartic.points[data.name]) {
            gartic.points[data.name] = 0;
        }

        io.emit("updateUserList", Object.values(usersOnline));

        socket.broadcast.emit("message", {
            name: "Lux Bot",
            text: `✨ **${data.name}** entrou no canal!`,
            id: "bot"
        });
    });

    /* CHAT */
    socket.on("chatMessage", (data) => {

        const user = usersOnline[socket.id];
        if (!user) return;

        const texto = filterText(data.text);

        /* VERIFICAR ACERTO GARTIC */
        if (
            gartic.ativo &&
            socket.id !== gartic.drawerId &&
            texto.toLowerCase() === gartic.palavra.toLowerCase()
        ) {

            gartic.points[user.name] += 10;

            io.emit("winner", user.name);

            io.emit("message", {
                name: "Lux Bot",
                text: `🏆 ${user.name} acertou a palavra: **${gartic.palavra}**`,
                id: "bot"
            });

            setTimeout(() => {
                iniciarRodada();
            }, 3000);

            return;
        }

        io.emit("message", {
            name: user.name,
            text: texto,
            id: socket.id
        });
    });

    /* DESENHO */
    socket.on("draw", (ponto) => {

        if (socket.id !== gartic.drawerId) return;

        socket.broadcast.emit("draw", ponto);
    });

    /* START GARTIC */
    socket.on("startGartic", () => {
        iniciarRodada();
    });

    socket.on("disconnect", () => {

        if (usersOnline[socket.id]) {

            const saiu = usersOnline[socket.id].name;

            delete usersOnline[socket.id];

            io.emit("updateUserList", Object.values(usersOnline));

            io.emit("message", {
                name: "Lux Bot",
                text: `❌ ${saiu} saiu.`,
                id: "bot"
            });

            if (socket.id === gartic.drawerId) {
                iniciarRodada();
            }
        }
    });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("🚀 Lux Chat + Gartic Online | Porta " + PORT);
});