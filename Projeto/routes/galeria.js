const express = require('express');
const router = express.Router();
const multer = require('multer');
const { storage, cloudinary } = require('../config/cloudinary');
const upload = multer({ storage });
const db = require('../db/db');

// Middleware para verificar se o usuário está logado
function checkAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

/**
 * Função auxiliar para verificar permissão de edição em um álbum.
 */
async function checkEditPermissionForAlbum(userId, albumId, connection) {
    // 1. Verificar se o usuário é o dono do álbum
    const [albumOwnerCheck] = await connection.query('SELECT UsuarioID FROM ALBUNS WHERE AlbumID = ?', [albumId]);
    if (albumOwnerCheck.length > 0 && albumOwnerCheck[0].UsuarioID === userId) {
        return true;
    }
    // 2. Se não é o dono, verificar se tem permissão de 'editar'
    const [permissionCheck] = await connection.query(
        `SELECT CompartilhamentoID FROM COMPARTILHAMENTOS
         WHERE AlbumID = ? AND UsuarioDestinatarioID = ? AND Permissao = 'editar'`,
        [albumId, userId]
    );
    return permissionCheck.length > 0;
}


/* GET Rota para exibir a página de upload */
router.get('/upload', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [meusAlbuns] = await db.query('SELECT AlbumID, Nome FROM ALBUNS WHERE UsuarioID = ?', [userId]);
        const [albunsCompartilhadosEditaveis] = await db.query(
            `SELECT a.AlbumID, a.Nome, u.NomeUsuario AS DonoDoAlbum
             FROM ALBUNS a JOIN COMPARTILHAMENTOS c ON a.AlbumID = c.AlbumID JOIN USUARIOS u ON a.UsuarioID = u.UsuarioID
             WHERE c.UsuarioDestinatarioID = ? AND c.Permissao = 'editar'`,
            [userId]
        );
        const [categorias] = await db.query('SELECT CategoriaID, Nome FROM CATEGORIAS ORDER BY Nome ASC');
        res.render('upload', {
            user: req.session.user,
            albuns: meusAlbuns.map(a => ({...a, isShared: false, DonoDoAlbum: 'Você'})).concat(
                     albunsCompartilhadosEditaveis.map(a => ({...a, isShared: true}))),
            categorias: categorias
        });
    } catch (err) {
        console.error("Erro ao carregar a página de upload:", err);
        res.status(500).send("Erro ao carregar a página.");
    }
});

/* POST Rota para processar o upload da imagem */
router.post('/upload', checkAuth, upload.single('imagem'), async (req, res, next) => {
    // Código de upload existente... (sem alterações)
    const { descricao, tipoAlbum, album_existente, album_novo_nome, album_novo_desc, tags, categoria_id } = req.body;
    const { path: url, filename } = req.file;
    const usuarioID = req.session.user.id;
    let albumId;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        if (tipoAlbum === 'novo' && album_novo_nome) {
            const [result] = await connection.query('INSERT INTO ALBUNS (Nome, Descricao, UsuarioID) VALUES (?, ?, ?)', [album_novo_nome, album_novo_desc, usuarioID]);
            albumId = result.insertId;
        } else if (tipoAlbum === 'existente' && album_existente) {
            albumId = album_existente;
            const canEdit = await checkEditPermissionForAlbum(usuarioID, albumId, connection);
            if (!canEdit) throw new Error('Você não tem permissão para adicionar imagens a este álbum.');
        } else {
            throw new Error('Você deve selecionar um álbum existente ou criar um novo.');
        }
        const [imagemResult] = await connection.query('INSERT INTO IMAGENS (NomeArquivo, Url, Descricao, UsuarioID, CategoriaID) VALUES (?, ?, ?, ?, ?)', [filename, url, descricao, usuarioID, categoria_id || null]);
        const imagemId = imagemResult.insertId;
        await connection.query('INSERT INTO IMAGEM_ALBUNS (ImagemID, AlbumID) VALUES (?, ?)', [imagemId, albumId]);
        if (tags && tags.trim() !== '') {
            const tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
            for (const tagName of tagsArray) {
                let [existingTags] = await connection.query('SELECT TagID FROM TAGS WHERE Nome = ? AND UsuarioID = ?', [tagName, usuarioID]);
                let tagId;
                if (existingTags.length > 0) {
                    tagId = existingTags[0].TagID;
                } else {
                    const [newTagResult] = await connection.query('INSERT INTO TAGS (Nome, UsuarioID) VALUES (?, ?)', [tagName, usuarioID]);
                    tagId = newTagResult.insertId;
                }
                await connection.query('INSERT INTO IMAGEM_TAGS (ImagemID, TagID) VALUES (?, ?)', [imagemId, tagId]);
            }
        }
        await connection.commit();
        res.redirect(`/albuns/${albumId}`);
    } catch (err) {
        await connection.rollback();
        // Lógica de erro existente...
        next(err);
    } finally {
        if (connection) connection.release();
    }
});

// --- Rotas de Edição da imagem --- (sem alterações)
router.get("/imagem/:id/edit", checkAuth, async (req, res, next) => { /* ... código existente ... */ });
router.post('/imagem/:id/edit', checkAuth, async (req, res, next) => { /* ... código existente ... */ });
router.post('/imagem/:id/delete', checkAuth, async (req, res, next) => { /* ... código existente ... */ });


// ===================================================================
//      NOVAS ROTAS PARA COMPARTILHAMENTO DE IMAGEM INDIVIDUAL
// ===================================================================

/**
 * GET Rota para exibir a página de compartilhamento de uma imagem.
 * Apenas o dono da imagem pode acessar.
 */
router.get('/imagem/:id/share', checkAuth, async (req, res, next) => {
    const imagemId = req.params.id;
    const ownerId = req.session.user.id;

    try {
        // 1. Busca a imagem e confirma se o usuário logado é o dono
        const [imagemResult] = await db.query(
            'SELECT ImagemID, Url, Descricao FROM IMAGENS WHERE ImagemID = ? AND UsuarioID = ?',
            [imagemId, ownerId]
        );

        if (imagemResult.length === 0) {
            return res.status(403).send('Imagem não encontrada ou você não tem permissão para compartilhá-la.');
        }
        const imagem = imagemResult[0];

        // 2. Busca a lista de amigos do usuário (dono da imagem)
        const [amigos] = await db.query(
            `SELECT u.UsuarioID, u.NomeUsuario FROM AMIZADES a
             JOIN USUARIOS u ON (a.UsuarioSolicitanteID = u.UsuarioID OR a.UsuarioAceitanteID = u.UsuarioID)
             WHERE (a.UsuarioSolicitanteID = ? OR a.UsuarioAceitanteID = ?) AND a.Status = 'aceita' AND u.UsuarioID != ?`,
            [ownerId, ownerId, ownerId]
        );

        // 3. Busca os compartilhamentos que já existem para esta imagem
        const [compartilhamentosExistentes] = await db.query(
            `SELECT c.UsuarioDestinatarioID, c.Permissao FROM COMPARTILHAMENTOS c
             WHERE c.ImagemID = ?`,
            [imagemId]
        );

        res.render('share-image', {
            user: req.session.user,
            imagem: imagem,
            amigos: amigos,
            compartilhamentos: compartilhamentosExistentes,
            error: null,
            success: null
        });

    } catch (err) {
        console.error('Erro ao carregar a página de compartilhamento de imagem:', err);
        next(err);
    }
});


/**
 * POST Rota para processar o compartilhamento de uma imagem.
 * Apenas o dono da imagem pode usar.
 */
router.post('/imagem/:id/share', checkAuth, async (req, res, next) => {
    const imagemId = req.params.id;
    const ownerId = req.session.user.id;
    const { compartilhamentos } = req.body; // Espera um array de { friendId, permissao }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Confirma novamente se o usuário é o dono
        const [imagemCheck] = await connection.query('SELECT ImagemID FROM IMAGENS WHERE ImagemID = ? AND UsuarioID = ?', [imagemId, ownerId]);
        if (imagemCheck.length === 0) {
            await connection.rollback();
            return res.status(403).send('Você não tem permissão para gerenciar esta imagem.');
        }

        // 2. Limpa os compartilhamentos antigos para esta imagem
        await connection.query('DELETE FROM COMPARTILHAMENTOS WHERE ImagemID = ?', [imagemId]);

        // 3. Insere os novos compartilhamentos, se houver algum
        if (compartilhamentos && Array.isArray(compartilhamentos)) {
            for (const comp of compartilhamentos) {
                if (comp.friendId && comp.permissao) {
                    await connection.query(
                        'INSERT INTO COMPARTILHAMENTOS (UsuarioRemetenteID, UsuarioDestinatarioID, ImagemID, AlbumID, Permissao) VALUES (?, ?, ?, NULL, ?)',
                        [ownerId, comp.friendId, imagemId, comp.permissao]
                    );
                }
            }
        }

        await connection.commit();
        
        // Redireciona de volta para o álbum onde a imagem está
        const [albumLink] = await db.query('SELECT AlbumID FROM IMAGEM_ALBUNS WHERE ImagemID = ? LIMIT 1', [imagemId]);
        if (albumLink.length > 0) {
            res.redirect(`/albuns/${albumLink[0].AlbumID}`);
        } else {
            res.redirect('/'); // Fallback para o dashboard
        }

    } catch (err) {
        await connection.rollback();
        console.error('Erro ao salvar compartilhamento de imagem:', err);
        next(err);
    } finally {
        if (connection) connection.release();
    }
});


router.get('/', checkAuth, async (req, res) => {
    res.redirect('/');
});

module.exports = router;