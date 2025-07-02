const express = require('express');
const router = express.Router();

/* GET para a página de criptografia (exemplo). */
router.get('/', function(req, res, next) {
  res.send('Página de Criptografia');
});

// Adicione aqui a lógica de criptografia.

module.exports = router;