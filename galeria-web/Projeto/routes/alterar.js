const express = require('express');
const router = express.Router();

/* GET para a página de alteração (exemplo). */
router.get('/', function(req, res, next) {
  res.send('Página de Alterar');
});

// Adicione aqui as rotas para alterar dados.

module.exports = router;