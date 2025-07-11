// routes/categoria.js
const express = require('express');
const router = express.Router();

// Aqui você vai adicionar suas rotas para categorias (GET, POST, PUT, DELETE)
// Por enquanto, podemos colocar uma rota de teste simples para verificar se funciona
router.get('/', (req, res) => {
    res.send('Página de gerenciamento de categorias - em construção!');
});

// ESSENCIAL: Exportar o objeto router
module.exports = router;