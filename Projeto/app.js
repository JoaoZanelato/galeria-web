require('dotenv').config();
require('./db/db');

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var http = require('http'); // Importar http
var { Server } = require("socket.io"); // Importar socket.io

var compartilhadosRouter = require('./routes/compartilhados');
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var deleteRouter = require('./routes/deletar');
var ciptografiaRouter = require('./routes/ciptografia');
var cadastroLoginRouter = require('./routes/cadastro_login');
var alterarRouter = require('./routes/alterar');
var albunsRouter = require('./routes/albuns')
var galeriaRouter = require('./routes/galeria');
var amizadesRouter = require('./routes/amizades');
var tagRouter = require('./routes/tag');
var categoriaRouter = require('./routes/categoria');

var app = express();
var server = http.createServer(app); // Criar servidor HTTP
var io = new Server(server); // Iniciar socket.io

app.set('trust proxy', 1);

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'um_segredo_muito_forte_e_dificil_de_adivinhar',
  resave: false,
  saveUninitialized: true,
  cookie: { 
      secure: process.env.NODE_ENV === 'production' 
  }
});

app.use(sessionMiddleware);

// Middleware para passar o 'io' para as rotas
app.use((req, res, next) => {
    req.io = io;
    next();
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use('/compartilhados', compartilhadosRouter);
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Configuração das Rotas
app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/delete', deleteRouter);
app.use('/ciptografia', ciptografiaRouter);
app.use('/cadastro-login', cadastroLoginRouter);
app.use('/auth', cadastroLoginRouter); 
app.use('/alterar', alterarRouter);
app.use('/albuns', albunsRouter);
app.use('/galeria', galeriaRouter);
app.use('/amizades', amizadesRouter);
app.use('/tag', tagRouter);
app.use('/categoria', categoriaRouter);

// Lógica do Socket.io
io.on('connection', (socket) => {
    console.log('Um usuário conectou via WebSocket:', socket.id);

    // Salvar o ID do usuário no socket para uso posterior
    socket.on('join', (userId) => {
        socket.join(userId);
        console.log(`Usuário ${userId} entrou na sua própria sala.`);
    });

    socket.on('disconnect', () => {
        console.log('Usuário desconectou:', socket.id);
    });
});


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

// Exportar o servidor em vez do app
module.exports = { app, server };