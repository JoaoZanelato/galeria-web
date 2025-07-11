const express = require('express');
const router = express.Router();

/* GET para a página de deleção (exemplo). */
router.get('/', function(req, res, next) {
  res.send('Página de Deletar');
});

// Você pode adicionar outras rotas POST/DELETE aqui para a lógica de deleção.

module.exports = router;