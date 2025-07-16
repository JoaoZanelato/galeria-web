// Importa o módulo express para criar rotas
const express = require('express');
// Cria um novo roteador do Express
const router = express.Router();
// Importa o módulo de acesso ao banco de dados
const db = require('../db/db');

// Middleware para garantir que o usuário está logado
function checkAuth(req, res, next) {
    if (!req.session.user) {
        // Se não estiver logado, redireciona para a página de login
        return res.redirect('/auth/login');
    }
    next();
}

/* GET Rota para a página "Compartilhados Comigo"
   Exibe álbuns e imagens que foram compartilhados com o usuário logado.
*/
router.get('/', checkAuth, async (req, res, next) => {
    // Obtém o ID do usuário logado (destinatário dos compartilhamentos)
    const usuarioDestinatarioID = req.session.user.id;

    try {
        // 1. Busca ÁLBUNS compartilhados com o usuário
        // Traz álbuns onde há registro de compartilhamento para o usuário
        const [albunsCompartilhados] = await db.query(
            `SELECT a.*, u.NomeUsuario AS DonoDoItem, c.Permissao
             FROM COMPARTILHAMENTOS c
             JOIN ALBUNS a ON c.AlbumID = a.AlbumID
             JOIN USUARIOS u ON a.UsuarioID = u.UsuarioID
             WHERE c.UsuarioDestinatarioID = ? AND c.AlbumID IS NOT NULL`,
            [usuarioDestinatarioID]
        );

        // 2. Busca IMAGENS INDIVIDUAIS compartilhadas com o usuário
        // Traz imagens onde há registro de compartilhamento para o usuário
        const [imagensCompartilhadas] = await db.query(
            `SELECT i.*, u.NomeUsuario AS DonoDoItem, c.Permissao
             FROM COMPARTILHAMENTOS c
             JOIN IMAGENS i ON c.ImagemID = i.ImagemID
             JOIN USUARIOS u ON i.UsuarioID = u.UsuarioID
             WHERE c.UsuarioDestinatarioID = ? AND c.ImagemID IS NOT NULL`,
            [usuarioDestinatarioID]
        );

        // Renderiza a nova view, passando os dados encontrados
        res.render('compartilhados', {
            user: req.session.user,           // Dados do usuário logado
            albuns: albunsCompartilhados,     // Lista de álbuns compartilhados
            imagens: imagensCompartilhadas,   // Lista de imagens compartilhadas
            title: 'Compartilhados Comigo'    // Título da página
        });

    } catch (err) {
        // Em caso de erro, registra no console e passa para o middleware de erro
        console.error('Erro ao buscar itens compartilhados:', err);
        next(err);
    }
});

// Exporta o roteador para ser usado em outros arquivos do projeto
module.exports = router;