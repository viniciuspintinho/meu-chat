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

function filterText(text = "") {
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
    "cachorro", "gato", "banana", "carro", "computador", "pizza",
    "telefone", "foguete", "aviao", "casa", "flor", "bicicleta"
];

let gartic = {
    ativo: false,
    palavra: "",
    drawer: "",
    drawerId: "",
    hint: "",
    points: {}
};

function gerarHint(palavra) {
    return palavra
        .split("")
        .map(() => "_")
        .join(" ");
}

function iniciarRodada() {
    const lista = Object.values(usersOnline);

    if (lista.length <= 0) {
        gartic.ativo = false;
        return;
    }

    const sorteado = lista[Math.floor(Math.random() * lista.length)];
    const palavra = palavras[Math.floor(Math.random() * palavras.length)];

    gartic.ativo = true;
    gartic.drawer = sorteado.name;
    gartic.drawerId = sorteado.id;
    gartic.palavra = palavra;
    gartic.hint = gerarHint(palavra);

    io.emit("clearCanvas");

    io.emit("garticStatus", {
        desenhista: gartic.drawer
    });

    io.to(gartic.drawerId).emit(
        "garticPalavra",
        gartic.palavra
    );

    io.emit("garticRanking", gartic.points);

    io.emit("message", {
        name: "Lux Bot",
        text: `🎮 Novo Gartic iniciado! **${gartic.drawer}** está desenhando.`,
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
                text: "Você está banido deste chat.",
                id: "bot"
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

        const texto = filterText(data.text || "");

        /* COMANDOS ADMIN */
        if (user.isAdmin) {

            if (texto.startsWith("/kick ")) {
                const alvo = texto.replace("/kick ", "").trim();
                const alvoId = Object.keys(usersOnline).find(id => usersOnline[id].name === alvo);

                if (alvoId) {
                    io.to(alvoId).emit("forceDisconnect", "Você foi expulso do chat.");
                }
                return;
            }

            if (texto.startsWith("/ban ")) {
                const alvo = texto.replace("/ban ", "").trim();
                bannedUsers.add(alvo);
                const alvoId = Object.keys(usersOnline).find(id => usersOnline[id].name === alvo);

                if (alvoId) {
                    io.to(alvoId).emit("forceDisconnect", "Você foi banido.");
                }
                return;
            }

            if (texto.startsWith("/unban ")) {
                const alvo = texto.replace("/unban ", "").trim();
                bannedUsers.delete(alvo);
                socket.emit("message", {
                    name: "SISTEMA",
                    text: `${alvo} foi desbanido.`,
                    id: "bot"
                });
                return;
            }
        }

        /* START GARTIC PELO CHAT MANTIDO POR COMPATIBILIDADE */
        if (texto.toLowerCase() === "/gartic") {
            iniciarRodada();
            return;
        }

        /* VERIFICAR ACERTO */
        if (
            gartic.ativo &&
            socket.id !== gartic.drawerId &&
            texto.toLowerCase() === gartic.palavra.toLowerCase()
        ) {
            gartic.points[user.name] += 10;

            io.emit("message", {
                name: "Lux Bot",
                text: `🏆 **${user.name}** acertou a palavra: **${gartic.palavra}**`,
                id: "bot"
            });

            io.emit("garticRanking", gartic.points);
            gartic.ativo = false;

            setTimeout(() => {
                iniciarRodada();
            }, 3000);

            return;
        }

        /* CHAT NORMAL */
        io.emit("message", {
            name: user.name,
            avatar: user.avatar,
            text: texto,
            msgType: data.msgType || "normal",
            replyTo: data.replyTo || null,
            isAdmin: user.isAdmin,
            id: socket.id
        });
    });

    /* DIGITANDO */
    socket.on("typing", (isTyping) => {
        const user = usersOnline[socket.id];
        if (user) {
            socket.broadcast.emit("displayTyping", {
                name: user.name,
                typing: isTyping
            });
        }
    });

    /* DESENHO */
    socket.on("draw", (ponto) => {
        if (!gartic.ativo) return;
        if (socket.id !== gartic.drawerId) return;
        socket.broadcast.emit("draw", ponto);
    });

    /* LIMPAR QUADRO */
    socket.on("clearMyCanvas", () => {
        if (socket.id !== gartic.drawerId) return;
        io.emit("clearCanvas");
    });

    /* START PELO BOTÃO (Sincroniza apenas quem clicou) */
    socket.on("startGartic", () => {
        if (gartic.ativo) {
            // Se o jogo já está rolando, envia os dados atuais para o usuário que clicou
            socket.emit("garticStatus", {
                desenhista: gartic.drawer
            });
            socket.emit("garticRanking", gartic.points);
            if (socket.id === gartic.drawerId) {
                socket.emit("garticPalavra", gartic.palavra);
            }
        } else {
            // Se não houver jogo, inicia para todos
            iniciarRodada();
        }
    });

    /* DESCONECTOU */
    socket.on("disconnect", () => {
        if (usersOnline[socket.id]) {
            const saiu = usersOnline[socket.id].name;
            delete usersOnline[socket.id];
            io.emit("updateUserList", Object.values(usersOnline));
            io.emit("message", {
                name: "Lux Bot",
                text: `❌ **${saiu}** saiu.`,
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