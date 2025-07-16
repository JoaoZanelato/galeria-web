// Carrega variáveis de ambiente do arquivo .env
require('dotenv').config();
// Inicializa a conexão com o banco de dados
require('./db/db');

// Importa módulos essenciais do Node.js e Express
var createError = require('http-errors'); // Para lidar com erros HTTP
var express = require('express');       // Framework principal
var path = require('path');             // Manipulação de caminhos de arquivos
var cookieParser = require('cookie-parser'); // Lê cookies das requisições
var logger = require('morgan');         // Middleware de log de requisições
var session = require('express-session'); // Gerenciamento de sessões
var http = require('http');             // Módulo HTTP para criar servidor
var { Server } = require("socket.io");  // Importa socket.io para WebSockets

// Importa os arquivos de rotas do projeto
var compartilhadosRouter = require('./routes/compartilhados');
var indexRouter = require('./routes/index');
var cadastroLoginRouter = require('./routes/cadastro_login');
var albunsRouter = require('./routes/albuns');
var galeriaRouter = require('./routes/galeria');
var amizadesRouter = require('./routes/amizades');
var tagRouter = require('./routes/tag');

// Inicializa o app Express
var app = express();
// Cria o servidor HTTP a partir do app Express
var server = http.createServer(app);
// Inicializa o Socket.io usando o servidor HTTP
var io = new Server(server);

// Configura o Express para confiar no proxy (necessário para cookies seguros em produção)
app.set('trust proxy', 1);

// Configuração do middleware de sessão
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'um_segredo_muito_forte_e_dificil_de_adivinhar', // Chave secreta da sessão
  resave: false,          // Não salva a sessão se nada mudou
  saveUninitialized: true,  // Salva sessões novas, mesmo que não modificadas
  cookie: { 
      secure: process.env.NODE_ENV === 'production' // Cookies seguros apenas em produção
  }
});

// Aplica o middleware de sessão a todas as rotas
app.use(sessionMiddleware);

// Middleware para passar o objeto 'io' (Socket.io) para todas as rotas via req.io
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Configuração da view engine (EJS) e pasta de views
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middlewares globais
app.use(logger('dev')); // Log de requisições HTTP
app.use(express.json()); // Parse de JSON no corpo da requisição
app.use(express.urlencoded({ extended: false })); // Parse de dados de formulário
app.use(cookieParser()); // Parse de cookies
app.use(express.static(path.join(__dirname, 'public'))); // Servir arquivos estáticos

// Configuração das rotas principais do sistema
app.use('/', indexRouter);
app.use('/auth', cadastroLoginRouter); 
app.use('/albuns', albunsRouter);
app.use('/galeria', galeriaRouter);
app.use('/amizades', amizadesRouter);
app.use('/tag', tagRouter);
app.use('/compartilhados', compartilhadosRouter);


// Lógica do Socket.io para eventos em tempo real
io.on('connection', (socket) => {
    console.log('Um usuário conectou via WebSocket:', socket.id);

    // Evento para o usuário entrar em sua própria sala (para notificações privadas)
    socket.on('join', (userId) => {
        socket.join(userId);
        console.log(`Usuário ${userId} entrou na sua própria sala.`);
    });

    // Evento de desconexão do usuário
    socket.on('disconnect', () => {
        console.log('Usuário desconectou:', socket.id);
    });
});

// Middleware para capturar erros 404 (rota não encontrada)
app.use(function(req, res, next) {
  next(createError(404));
});

// Middleware para tratamento de erros gerais
app.use(function(err, req, res, next) {
  res.locals.message = err.message; // Mensagem do erro
  res.locals.error = req.app.get('env') === 'development' ? err : {}; // Mostra detalhes só em dev
  res.status(err.status || 500); // Define o status HTTP
  res.render('error'); // Renderiza a página de erro
});

// Exporta o app e o server para uso no arquivo bin/www
module.exports = { app, server };
