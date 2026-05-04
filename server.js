const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const Datastore = require("nedb"); // Banco de dados local

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Inicialização dos Bancos de Dados
const db = new Datastore({ filename: "database.db", autoload: true });
const msgDb = new Datastore({ filename: "messages.db", autoload: true }); // Histórico de mensagens
const cmdDb = new Datastore({ filename: "commands.db", autoload: true }); // NOVO: Banco de comandos customizados

app.use(express.static(path.join(__dirname, "public")));

/* =========================
   CONFIG CHAT ORIGINAL
========================= */

const ADMINS = ["vn7", "pl"];
let usersOnline = {};
let bannedUsers = new Set();
const badWords = ["palavrao1", "palavrao2", "toxic"];

// Controle de Anti-Flood
const msgHistory = {};

function filterText(text = "") {
    let cleaned = text;
    badWords.forEach(word => {
        const reg = new RegExp(word, "gi");
        cleaned = cleaned.replace(reg, "****");
    });
    return cleaned;
}

/* =========================
   CONFIG GARTIC (ATUALIZADO)
========================= */

// Lista expandida com mais de 50 itens divididos por categorias
const palavras = [
    // ANIMAIS
    "tubarao", "elefante", "girafa", "jacare", "tartaruga", "morcego", "pinguim", "formiga", "leao", "zebra", "macaco", "cobra", "aranha", "coruja", "camaleao", "polvo", "vaca", "porco", "cachorro", "gato", "coelho","urso", "raposa", "cervo", "golfinho", "baleia", "canguru", "panda", "lobo", "foca", "avestruz",
    // OBJETOS
    "martelo", "guarda-chuva", "escada", "cadeira", "relogio", "oculos", "mochila", "tesoura", "caneta", "espelho", "lanterna", "violao", "skate", "controle", "bateria", "xicara", "telefone", "computador", "chave", "carteira", "faca", "garfo", "colher", "abajur", "copo", "chaleira", "ventilador", "microfone", "impressora", "teclado",
    // COMIDA
    "melancia", "hamburguer", "sorvete", "batata frita", "ovo frito", "abacaxi", "pizza", "queijo", "cenoura", "pipoca", "donut", "sushi", "banana","chocolate", "cafe", "pao", "leite", "salada", "bolo", "manga",
    // NATUREZA / ESPAÇO / LUGARES
    "montanha", "vulcao", "furacao", "planeta", "estrela", "arco-iris", "cachoeira", "floresta", "nuvem", "sol", "lua", "foguete", "pinto", "flor", "castelo", "farol", "ponte", "piramide",
    // TRANSPORTE
    "aviao", "bicicleta", "helicoptero", "submarino", "trator", "navio", "ambulancia", "moto", "caminhao", "trem", "onibus", "carro", "barco", "balão", "skate", "patinete"
];

let gartic = {
    ativo: false,
    palavra: "",
    drawer: "",
    drawerId: "",
    hint: "",
    points: {},
    timerHint: null // Timer para a dica automática
};

let ultimaPalavra = ""; // Para evitar repetição imediata

function gerarHint(palavra) {
    return palavra
        .split("")
        .map((char) => (char === " " || char === "-" ? char : "_"))
        .join(" ");
}

function iniciarRodada() {
    const lista = Object.values(usersOnline);

    if (lista.length <= 0) {
        gartic.ativo = false;
        return;
    }

    // Limpa timer de dica anterior se houver
    if (gartic.timerHint) clearTimeout(gartic.timerHint);

    const sorteado = lista[Math.floor(Math.random() * lista.length)];
    
    // Lógica para evitar que a mesma palavra saia duas vezes seguidas
    let palavraSorteada;
    do {
        palavraSorteada = palavras[Math.floor(Math.random() * palavras.length)];
    } while (palavraSorteada === ultimaPalavra && palavras.length > 1);

    ultimaPalavra = palavraSorteada;

    gartic.ativo = true;
    gartic.drawer = sorteado.name;
    gartic.drawerId = sorteado.id;
    gartic.palavra = palavraSorteada;
    gartic.hint = gerarHint(palavraSorteada);

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

    // Inicia timer de 30 segundos para enviar a dica
    gartic.timerHint = setTimeout(() => {
        if (gartic.ativo) {
            io.emit("message", {
                name: "Lux Bot",
                text: `💡 DICA: A palavra tem **${gartic.palavra.length}** letras e começa com "**${gartic.palavra[0].toUpperCase()}**".`,
                id: "bot"
            });
        }
    }, 30000);
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

        // Recuperação de pontos do Banco de Dados
        db.findOne({ name: data.name }, (err, doc) => {
            if (doc) {
                gartic.points[data.name] = doc.points || 0;
            } else {
                db.insert({ name: data.name, points: 0 });
                gartic.points[data.name] = 0;
            }
            io.emit("garticRanking", gartic.points);
        });

        const isAdmin = ADMINS.includes(data.name);

        usersOnline[socket.id] = {
            id: socket.id,
            name: data.name,
            avatar: data.avatar,
            isAdmin,
            room: "Geral" // Sala padrão
        };

        socket.join("Geral");

        io.emit("updateUserList", Object.values(usersOnline));

        socket.broadcast.to("Geral").emit("message", {
            name: "Lux Bot",
            text: `✨ **${data.name}** entrou no canal!`,
            id: "bot"
        });

        // Enviar histórico ao usuário que acabou de entrar (Persistência)
        msgDb.find({ room: "Geral" }).sort({ timestamp: 1 }).limit(50).exec((err, docs) => {
            docs.forEach(msg => socket.emit("message", msg));
        });
    });

    // NOVO: Lógica de troca de salas
    socket.on("joinRoom", (roomName) => {
        const user = usersOnline[socket.id];
        if (!user) return;

        socket.leave(user.room);
        user.room = roomName;
        socket.join(roomName);

        socket.emit("roomInfo", roomName);
        
        // Carrega histórico da sala específica
        msgDb.find({ room: roomName }).sort({ timestamp: 1 }).limit(50).exec((err, docs) => {
            docs.forEach(msg => socket.emit("message", msg));
        });
    });

    /* CHAT */
    socket.on("chatMessage", (data) => {

        const user = usersOnline[socket.id];
        if (!user) return;

        // Lógica Anti-Flood (Máximo 5 mensagens em 3 segundos)
        const now = Date.now();
        if (!msgHistory[socket.id]) msgHistory[socket.id] = [];
        msgHistory[socket.id] = msgHistory[socket.id].filter(t => now - t < 3000);
        
        if (msgHistory[socket.id].length >= 5) {
            return socket.emit("message", { name: "SISTEMA", text: "🚫 Você está enviando mensagens rápido demais!", id: "bot" });
        }
        msgHistory[socket.id].push(now);

        const texto = filterText(data.text || "");

        /* COMANDOS ADMIN */
        if (user.isAdmin) {

            // Comando /shout para Admins
            if (texto.startsWith("/shout ")) {
                const grito = texto.replace("/shout ", "").trim();
                io.emit("shout", { name: user.name, text: grito });
                return;
            }

            // NOVO: Comando /pin para Admins
            if (texto.startsWith("/pin ")) {
                const pinText = texto.replace("/pin ", "").trim();
                io.to(user.room).emit("newPin", pinText);
                return;
            }

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

            // NOVO: Comando /addcmd para Admins (/addcmd nome_comando resposta)
            if (texto.startsWith("/addcmd ")) {
                const parts = texto.replace("/addcmd ", "").split(" ");
                const cmdName = parts[0].toLowerCase();
                const response = parts.slice(1).join(" ");
                if (cmdName && response) {
                    cmdDb.update({ name: cmdName }, { name: cmdName, response: response }, { upsert: true });
                    socket.emit("message", { name: "SISTEMA", text: `✅ Comando /${cmdName} criado!`, id: "bot" });
                }
                return;
            }
        }

        /* COMANDOS CUSTOMIZADOS (Dinâmicos) */
        if (texto.startsWith("/")) {
            const cmdInput = texto.split(" ")[0].toLowerCase().replace("/", "");
            cmdDb.findOne({ name: cmdInput }, (err, cmd) => {
                if (cmd) {
                    io.to(user.room).emit("message", {
                        name: "Lux Bot",
                        text: cmd.response.replace("{user}", user.name),
                        id: "bot"
                    });
                }
            });
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

            // Salva os pontos no Banco de Dados
            db.update({ name: user.name }, { $inc: { points: 10 } }, {});

            io.emit("message", {
                name: "Lux Bot",
                text: `🏆 **${user.name}** acertou a palavra: **${gartic.palavra}**`,
                id: "bot"
            });

            io.emit("garticRanking", gartic.points);
            gartic.ativo = false;

            // Limpa o timer da dica ao acertar
            if (gartic.timerHint) clearTimeout(gartic.timerHint);

            setTimeout(() => {
                iniciarRodada();
            }, 3000);

            return;
        }

        /* CHAT NORMAL + SALVAR NO HISTÓRICO */
        const mensagemFinal = {
            name: user.name,
            avatar: user.avatar,
            text: texto,
            msgType: data.msgType || "normal",
            replyTo: data.replyTo || null,
            isAdmin: user.isAdmin,
            id: socket.id,
            timestamp: now,
            room: user.room // Salva a sala da mensagem
        };

        io.to(user.room).emit("message", mensagemFinal);
        msgDb.insert(mensagemFinal); // Salva a mensagem no banco de dados persistente
    });

    /* DIGITANDO */
    socket.on("typing", (isTyping) => {
        const user = usersOnline[socket.id];
        if (user) {
            socket.broadcast.to(user.room).emit("displayTyping", {
                name: user.name,
                typing: isTyping
            });
        }
    });

    /* DESENHO ATUALIZADO (Suporta cores e tamanhos) */
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
            socket.emit("garticStatus", {
                desenhista: gartic.drawer
            });
            socket.emit("garticRanking", gartic.points);
            if (socket.id === gartic.drawerId) {
                socket.emit("garticPalavra", gartic.palavra);
            }
        } else {
            iniciarRodada();
        }
    });

    /* DESCONECTOU */
    socket.on("disconnect", () => {
        if (usersOnline[socket.id]) {
            const saiu = usersOnline[socket.id].name;
            const userRoom = usersOnline[socket.id].room;
            delete usersOnline[socket.id];
            delete msgHistory[socket.id]; // Limpa histórico do flood
            io.emit("updateUserList", Object.values(usersOnline));
            io.to(userRoom).emit("message", {
                name: "Lux Bot",
                text: `❌ **${saiu}** saiu.`,
                id: "bot"
            });

            if (socket.id === gartic.drawerId) {
                if (gartic.timerHint) clearTimeout(gartic.timerHint);
                iniciarRodada();
            }
        }
    });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("🚀 Lux Chat + Gartic Online | Porta " + PORT);
});