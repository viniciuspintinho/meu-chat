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
const cmdDb = new Datastore({ filename: "commands.db", autoload: true }); // Banco de comandos customizados
const logDb = new Datastore({ filename: "logs.db", autoload: true }); // Logs de moderação

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

function logModeration(action, admin, target, details = '') {
    const logEntry = {
        timestamp: Date.now(),
        action,
        admin,
        target,
        details
    };
    logDb.insert(logEntry);
}

function filterText(text) {
    return String(text || '').replace(/<[^>]*>/g, '').trim();
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

        // Recuperação de pontos e status reais do Banco de Dados
        db.findOne({ name: data.name }, (err, doc) => {
            let userStats = doc || { 
                name: data.name, 
                points: 0, 
                msgCount: 0, 
                garticWins: 0, 
                level: 1,
                xp: 0,
                joinDate: Date.now()
            };

            if (!doc) {
                db.insert(userStats);
            }
            
            gartic.points[data.name] = userStats.points || 0;

            const isAdmin = ADMINS.includes(data.name);

            usersOnline[socket.id] = {
                id: socket.id,
                name: data.name,
                avatar: data.avatar,
                profileFrame: isAdmin ? (data.profileFrame || 'none') : 'none',
                isAdmin,
                room: "Geral", // Sala padrão
                // Status Reais Individuais
                msgCount: userStats.msgCount || 0,
                garticWins: userStats.garticWins || 0,
                level: userStats.level || 1,
                xp: userStats.xp || 0,
                joinDate: userStats.joinDate
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
            
            io.emit("garticRanking", gartic.points);
        });
    });

    // Lógica de troca de salas
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

        // ATUALIZAÇÃO DE STATUS REAL: Mensagem Enviada
        if (!data.msgType || data.msgType === "normal") {
            db.update({ name: user.name }, { $inc: { msgCount: 1 } }, {});
            user.msgCount++;
            io.emit("updateUserList", Object.values(usersOnline));
        }

        /* COMANDOS ADMIN */
        if (user.isAdmin) {

            // Comando /shout para Admins
            if (texto.startsWith("/shout ")) {
                const grito = texto.replace("/shout ", "").trim();
                io.emit("shout", { name: user.name, text: grito });
                return;
            }

            // Comando /pin para Admins
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
                    logModeration('kick', user.name, alvo, 'Expulso do chat');
                }
                return;
            }

            if (texto.startsWith("/ban ")) {
                const parts = texto.replace("/ban ", "").split(" ");
                const alvo = parts[0];
                const duration = parts[1] ? parseInt(parts[1]) : null; // Duração em minutos
                bannedUsers.add(alvo);
                const alvoId = Object.keys(usersOnline).find(id => usersOnline[id].name === alvo);

                if (alvoId) {
                    io.to(alvoId).emit("forceDisconnect", duration ? `Você foi banido por ${duration} minutos.` : "Você foi banido.");
                    if (duration) {
                        setTimeout(() => {
                            bannedUsers.delete(alvo);
                            logModeration('unban_auto', 'Sistema', alvo, `Ban temporário expirado (${duration} min)`);
                        }, duration * 60 * 1000);
                    }
                    logModeration('ban', user.name, alvo, duration ? `Ban por ${duration} minutos` : 'Ban permanente');
                }
                return;
            }

            if (texto === "/logs") {
                logDb.find({}).sort({ timestamp: -1 }).limit(10).exec((err, logs) => {
                    if (!logs || logs.length === 0) {
                        socket.emit("message", { name: "SISTEMA", text: "Nenhum log encontrado.", id: "bot" });
                        return;
                    }
                    const logText = logs.map(log => `${new Date(log.timestamp).toLocaleString()}: ${log.admin} ${log.action} ${log.target} - ${log.details}`).join('\n');
                    socket.emit("message", { name: "SISTEMA", text: `Logs recentes:\n${logText}`, id: "bot" });
                });
                return;
            }

            // Comando /addcmd para Admins (/addcmd nome_comando resposta)
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

        /* START GARTIC PELO CHAT */
        if (texto.toLowerCase() === "/gartic") {
            iniciarRodada();
            return;
        }

        /* VERIFICAR ACERTO GARTIC */
        if (
            gartic.ativo &&
            socket.id !== gartic.drawerId &&
            texto.toLowerCase() === gartic.palavra.toLowerCase()
        ) {
            gartic.points[user.name] = (gartic.points[user.name] || 0) + 10;

            // ATUALIZAÇÃO DE STATUS REAL: Vitória no Gartic e Pontos
            db.update({ name: user.name }, { $inc: { points: 10, garticWins: 1 } }, {});
            user.garticWins++;

            io.emit("message", {
                name: "Lux Bot",
                text: `🏆 **${user.name}** acertou a palavra: **${gartic.palavra}**`,
                id: "bot"
            });

            io.emit("garticRanking", gartic.points);
            io.emit("updateUserList", Object.values(usersOnline));
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
            profileFrame: user.profileFrame || 'none',
            text: texto,
            msgType: data.msgType || "normal",
            replyTo: data.replyTo || null,
            isAdmin: user.isAdmin,
            id: socket.id,
            timestamp: now,
            room: user.room,
            level: user.level,
            msgCount: user.msgCount,
            garticWins: user.garticWins,
            temp: data.temp || false
        };

        io.to(user.room).emit("message", mensagemFinal);
        msgDb.insert(mensagemFinal); // Salva no banco persistente

        // Se for temporária, deletar após 30 segundos
        if (mensagemFinal.temp) {
            setTimeout(() => {
                io.to(user.room).emit("deleteMessage", mensagemFinal.id);
            }, 30000);
        }
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

    /* DESENHO ATUALIZADO */
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

    /* REAÇÕES */
    socket.on("reactMessage", (data) => {
        const user = usersOnline[socket.id];
        if (!user) return;
        io.to(user.room).emit("messageReaction", { messageId: data.messageId, emoji: data.emoji, user: user.name });
    });

    /* EDITAR MENSAGEM */
    socket.on("editMessage", (data) => {
        const user = usersOnline[socket.id];
        if (!user) return;
        io.to(user.room).emit("messageEdited", { messageId: data.messageId, newText: data.newText });
    });

    /* PIN MENSAGEM */
    socket.on("pinMessage", (data) => {
        const user = usersOnline[socket.id];
        if (!user) return;
        // Buscar mensagem no histórico
        msgDb.findOne({ id: data.messageId }, (err, msg) => {
            if (msg) {
                io.to(user.room).emit("messagePinned", msg);
            }
        });
    });

    /* UNPIN MENSAGEM */
    socket.on("unpinMessage", (data) => {
        const user = usersOnline[socket.id];
        if (!user) return;
        io.to(user.room).emit("messageUnpinned", { messageId: data.messageId });
    });

    /* STATUS UPDATE */
    socket.on("statusUpdate", (data) => {
        const user = usersOnline[socket.id];
        if (!user) return;
        io.to(user.room).emit("statusUpdate", { name: user.name, status: data.status });
    });

    /* MENSAGEM TEMPORÁRIA */
    socket.on("tempMessage", (data) => {
        const user = usersOnline[socket.id];
        if (!user) return;
        io.to(user.room).emit("tempMessage", { 
            name: user.name, 
            text: data.text, 
            timestamp: Date.now(),
            duration: data.duration || 30000 // 30 segundos padrão
        });
    });

    /* DESCONECTOU */
    socket.on("disconnect", () => {
        if (usersOnline[socket.id]) {
            const saiu = usersOnline[socket.id].name;
            const userRoom = usersOnline[socket.id].room;
            delete usersOnline[socket.id];
            delete msgHistory[socket.id]; 
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