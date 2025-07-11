const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Middleware para garantir que o usuário está logado
function checkAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

/* GET Rota para a página "Compartilhados Comigo" */
router.get('/', checkAuth, async (req, res, next) => {
    const usuarioDestinatarioID = req.session.user.id;

    try {
        // 1. Busca ÁLBUNS compartilhados com o usuário
        const [albunsCompartilhados] = await db.query(
            `SELECT a.*, u.NomeUsuario AS DonoDoItem, c.Permissao
             FROM COMPARTILHAMENTOS c
             JOIN ALBUNS a ON c.AlbumID = a.AlbumID
             JOIN USUARIOS u ON a.UsuarioID = u.UsuarioID
             WHERE c.UsuarioDestinatarioID = ? AND c.AlbumID IS NOT NULL`,
            [usuarioDestinatarioID]
        );

        // 2. Busca IMAGENS INDIVIDUAIS compartilhadas com o usuário
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
            user: req.session.user,
            albuns: albunsCompartilhados,
            imagens: imagensCompartilhadas,
            title: 'Compartilhados Comigo'
        });

    } catch (err) {
        console.error('Erro ao buscar itens compartilhados:', err);
        next(err);
    }
});

module.exports = router;