const express = require('express');
const router = express.Router();

/* GET para a página de cadastro (exemplo). */
router.get('/cadastro', function(req, res, next) {
  res.send('Página de Cadastro');
});

/* GET para a página de login (exemplo). */
router.get('/login', function(req, res, next) {
  res.send('Página de Login');
});

// Adicione aqui as rotas POST para processar o cadastro e o login.

module.exports = router;