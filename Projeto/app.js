require('dotenv').config();
require('./db/db');

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session'); // Adicionado para gerenciamento de sessão

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
app.set('trust proxy', 1);
// Configuração da Sessão
// É crucial que isso venha ANTES da configuração das rotas
app.use(session({
  // A 'secret' é usada para assinar o cookie de ID da sessão.
  // É importante que seja uma string longa, aleatória e mantida em segredo.
  // Armazene-a em seu arquivo .env para segurança.
  secret: process.env.SESSION_SECRET || 'um_segredo_muito_forte_e_dificil_de_adivinhar',
  
  // 'resave: false' evita que a sessão seja salva de volta no armazenamento de sessão
  // se ela não foi modificada durante a requisição.
  resave: false,

  // 'saveUninitialized: true' força uma sessão "não inicializada" a ser salva.
  // Uma sessão é não inicializada quando é nova, mas não modificada.
  saveUninitialized: true,
  
  // Configurações do cookie da sessão.
  cookie: { 
      // Em produção, com HTTPS, você deve definir 'secure: true'.
      // Isso garante que o navegador só envie o cookie por conexões HTTPS.
      secure: process.env.NODE_ENV === 'production' 
  }
}));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

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
// Rota de autenticação padronizada para '/auth'
app.use('/auth', cadastroLoginRouter); 
app.use('/alterar', alterarRouter);
app.use('/albuns', albunsRouter);
app.use('/galeria', galeriaRouter);
app.use('/amizades', amizadesRouter);

app.use('/tag', tagRouter);
app.use('/categoria', categoriaRouter);
// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;