// routes/tag.js
const express = require('express');
const router = express.Router();
const db = require('../db/db'); // db é o seu pool de conexões do mysql2/promise

// Rota de teste existente
router.get('/', (req, res) => {
    res.send('Página de gerenciamento de tags - em construção!');
});

// Nova rota para buscar imagens por tag
router.get('/search', async (req, res) => {
    const { tag } = req.query; // Pega a tag da query string (ex: /tag/search?tag=minhatag)
    const userId = req.session.user ? req.session.user.id : null; // Pega o ID do usuário logado

    if (!tag) {
        return res.status(400).json({ message: 'Parâmetro "tag" é obrigatório.' });
    }
    // É importante ter um usuário logado para buscar suas tags/imagens
    if (!userId) {
        return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    try {
        // Consulta SQL CORRETA para buscar imagens por tag, considerando o usuário logado
        const sql = `
            SELECT DISTINCT
                i.ImagemID,
                i.NomeArquivo,
                i.Url,
                i.Descricao,
                i.DataUpload,
                i.DataModificacao,
                i.UsuarioID,
                i.CategoriaID
            FROM IMAGENS i
            JOIN IMAGEM_TAGS it ON i.ImagemID = it.ImagemID
            JOIN TAGS t ON it.TagID = t.TagID
            WHERE t.Nome LIKE ? AND i.UsuarioID = ?;
            -- DISTINCT para evitar imagens duplicadas se houver várias tags correspondentes
        `;
        const searchTerm = `%${tag}%`;

        // Executa a query usando o pool.query()
        const [images] = await db.query(sql, [searchTerm, userId]);

        res.json(images); // Retorna as imagens encontradas como JSON

    } catch (error) {
        console.error('Erro ao buscar imagens por tag:', error);
        // Em um ambiente de produção, não retorne detalhes do erro SQL diretamente ao cliente.
        // Apenas uma mensagem genérica de erro interno.
        res.status(500).json({ message: 'Erro interno do servidor ao buscar imagens.' });
    }
});

// ESSENCIAL: Exportar o objeto router
module.exports = router;