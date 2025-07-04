const express = require('express');
const router = express.Router();

/* Rota GET para a página de cadastro. */
router.get('/cadastro', function(req, res, next) {
  // O correto é usar res.render() para mostrar o arquivo EJS.
  res.render('cadastro');
});

/* Rota GET para a página de login. */
router.get('/login', function(req, res, next) {
  // O correto é usar res.render() para mostrar o arquivo EJS.
  res.render('login');
});

// As rotas POST (para quando o usuário clicar em "Cadastrar" ou "Entrar")
// serão adicionadas depois.

module.exports = router;