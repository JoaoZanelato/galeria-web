// routes/tag.js

// Importa o módulo express para criar rotas
const express = require('express');
// Cria um novo roteador do Express
const router = express.Router();
// Importa o módulo de acesso ao banco de dados (pool de conexões mysql2/promise)
const db = require('../db/db');

// Rota de teste existente
// Quando acessa /tag, retorna uma mensagem simples
router.get('/', (req, res) => {
    res.send('Página de gerenciamento de tags - em construção!');
});

// Nova rota para buscar imagens por tag
// Exemplo de uso: /tag/search?tag=minhatag
router.get('/search', async (req, res) => {
    // Obtém o parâmetro 'tag' da query string
    const { tag } = req.query;
    // Obtém o ID do usuário logado (se existir na sessão)
    const userId = req.session.user ? req.session.user.id : null;

    // Valida se o parâmetro 'tag' foi informado
    if (!tag) {
        return res.status(400).json({ message: 'Parâmetro "tag" é obrigatório.' });
    }
    // Valida se o usuário está autenticado
    if (!userId) {
        return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    try {
        // Consulta SQL para buscar imagens do usuário que possuem a tag informada
        // Usa LIKE para buscar tags parcialmente (ex: "flo" encontra "flor")
        // DISTINCT evita imagens duplicadas caso tenham múltiplas tags semelhantes
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
        // Monta o termo de busca para o LIKE
        const searchTerm = `%${tag}%`;

        // Executa a consulta no banco de dados
        const [images] = await db.query(sql, [searchTerm, userId]);

        // Retorna as imagens encontradas como JSON
        res.json(images);

    } catch (error) {
        // Em caso de erro, registra no console e retorna erro genérico ao cliente
        console.error('Erro ao buscar imagens por tag:', error);
        res.status(500).json({ message: 'Erro interno do servidor ao buscar imagens.' });
    }
});

// Exporta o roteador para ser usado em outros arquivos do projeto
module.exports = router;