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
 * Retorna true se o usuário for dono do álbum OU tiver permissão 'editar' no compartilhamento.
 */
async function checkEditPermissionForAlbum(userId, albumId, connection) {
    // 1. Verificar se o usuário é o dono do álbum
    const [albumOwnerCheck] = await connection.query('SELECT UsuarioID FROM ALBUNS WHERE AlbumID = ?', [albumId]);
    if (albumOwnerCheck.length > 0 && albumOwnerCheck[0].UsuarioID === userId) {
        return true; // É o dono do álbum
    }

    // 2. Se não é o dono, verificar se tem permissão de 'editar' via compartilhamento
    const [permissionCheck] = await connection.query(
        `SELECT CompartilhamentoID FROM COMPARTILHAMENTOS
         WHERE AlbumID = ? AND UsuarioDestinatarioID = ? AND Permissao = 'editar'`,
        [albumId, userId]
    );
    return permissionCheck.length > 0; // Tem permissão de editar
}


/* GET Rota para exibir a página de upload com a lista de categorias */
router.get('/upload', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Meus próprios álbuns
        const [meusAlbuns] = await db.query('SELECT AlbumID, Nome, UsuarioID FROM ALBUNS WHERE UsuarioID = ?', [userId]);

        // Álbuns compartilhados COMIGO onde tenho permissão de EDITAR
        const [albunsCompartilhadosEditaveis] = await db.query(
            `SELECT a.AlbumID, a.Nome, a.UsuarioID, u.NomeUsuario AS DonoDoAlbum
             FROM ALBUNS a
             JOIN COMPARTILHAMENTOS c ON a.AlbumID = c.AlbumID
             JOIN USUARIOS u ON a.UsuarioID = u.UsuarioID
             WHERE c.UsuarioDestinatarioID = ? AND c.Permissao = 'editar'
             ORDER BY a.Nome ASC`,
            [userId]
        );

        // Combina meus álbuns e os álbuns compartilhados editáveis
        // Adiciona uma flag 'isShared' e 'donoDoAlbum' para facilitar a exibição no frontend
        const todosAlbuns = meusAlbuns.map(album => ({
            AlbumID: album.AlbumID,
            Nome: album.Nome,
            isShared: false,
            DonoDoAlbum: req.session.user.nome // Sou o dono
        })).concat(
            albunsCompartilhadosEditaveis.map(album => ({
                AlbumID: album.AlbumID,
                Nome: album.Nome,
                isShared: true,
                DonoDoAlbum: album.DonoDoAlbum // O nome do amigo dono
            }))
        );

        // Busca as categorias globais para o dropdown
        const [categorias] = await db.query('SELECT CategoriaID, Nome FROM CATEGORIAS ORDER BY Nome ASC');

        res.render('upload', {
            user: req.session.user,
            albuns: todosAlbuns, // Passa todos os álbuns (meus e compartilhados editáveis)
            categorias: categorias
        });
    } catch (err) {
        console.error("Erro ao carregar a página de upload:", err);
        res.status(500).send("Erro ao carregar a página.");
    }
});

/* POST Rota para processar o upload da imagem e associar à categoria existente */
router.post('/upload', checkAuth, upload.single('imagem'), async (req, res, next) => {
    const { descricao, tipoAlbum, album_existente, album_novo_nome, album_novo_desc, tags, categoria_id } = req.body;
    const { path: url, filename } = req.file;
    const usuarioID = req.session.user.id; // Usuário que está FAZENDO o upload
    let albumId; // ID do álbum de destino

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Lógica de seleção/criação de álbum
        if (tipoAlbum === 'novo' && album_novo_nome) {
            // Se um NOVO álbum está sendo criado, o criador é o dono
            const [result] = await connection.query(
                'INSERT INTO ALBUNS (Nome, Descricao, UsuarioID) VALUES (?, ?, ?)',
                [album_novo_nome, album_novo_desc, usuarioID]
            );
            albumId = result.insertId;
        } else if (tipoAlbum === 'existente' && album_existente) {
            albumId = album_existente;
            // NOVO: Se o álbum EXISTE, verificar permissão para adicionar imagem a ele
            const canEdit = await checkEditPermissionForAlbum(usuarioID, albumId, connection);
            if (!canEdit) {
                throw new Error('Você não tem permissão para adicionar imagens a este álbum.');
            }
        } else {
            throw new Error('Você deve selecionar um álbum existente ou criar um novo.');
        }

        const categoriaID = categoria_id || null;

        // 2. Insere a imagem no banco de dados
        // A imagem pertence ao usuário que a UPLOUDEOU (usuarioID)
        const [imagemResult] = await connection.query(
            'INSERT INTO IMAGENS (NomeArquivo, Url, Descricao, UsuarioID, CategoriaID) VALUES (?, ?, ?, ?, ?)',
            [filename, url, descricao, usuarioID, categoriaID]
        );
        const imagemId = imagemResult.insertId;

        // 3. Associa a imagem ao álbum
        await connection.query(
            'INSERT INTO IMAGEM_ALBUNS (ImagemID, AlbumID) VALUES (?, ?)',
            [imagemId, albumId]
        );

        // 4. Lógica de processamento de tags (inclusão das tags é sempre com o UsuarioID do uploader)
        if (tags && tags.trim() !== '') {
            const tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
            for (const tagName of tagsArray) {
                const [existingTags] = await connection.query('SELECT TagID FROM TAGS WHERE Nome = ? AND UsuarioID = ?', [tagName, usuarioID]);
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
        console.error('Erro no processo de upload:', err);
        // NOVO: Recupera todos os álbuns (meus e compartilhados editáveis) novamente em caso de erro
        const userId = req.session.user.id;
        const [meusAlbuns] = await db.query('SELECT AlbumID, Nome, UsuarioID FROM ALBUNS WHERE UsuarioID = ?', [userId]);
        const [albunsCompartilhadosEditaveis] = await db.query(
            `SELECT a.AlbumID, a.Nome, a.UsuarioID, u.NomeUsuario AS DonoDoAlbum
             FROM ALBUNS a
             JOIN COMPARTILHAMENTOS c ON a.AlbumID = c.AlbumID
             JOIN USUARIOS u ON a.UsuarioID = u.UsuarioID
             WHERE c.UsuarioDestinatarioID = ? AND c.Permissao = 'editar'
             ORDER BY a.Nome ASC`,
            [userId]
        );
        const todosAlbuns = meusAlbuns.map(album => ({
            AlbumID: album.AlbumID,
            Nome: album.Nome,
            isShared: false,
            DonoDoAlbum: req.session.user.nome
        })).concat(
            albunsCompartilhadosEditaveis.map(album => ({
                AlbumID: album.AlbumID,
                Nome: album.Nome,
                isShared: true,
                DonoDoAlbum: album.DonoDoAlbum
            }))
        );
        const [categorias] = await db.query('SELECT CategoriaID, Nome FROM CATEGORIAS ORDER BY Nome ASC');
        
        res.render('upload', {
            user: req.session.user,
            albuns: todosAlbuns, // Passa todos os álbuns combinados
            categorias: categorias,
            error: 'Erro ao fazer upload da imagem: ' + err.message
        });
    } finally {
        if (connection) connection.release();
    }
});

// --- Rotas de Edição da imagem ---

/* GET Rota para exibir o formulário de edição de uma imagem */
router.get("/imagem/:id/edit", checkAuth, async (req, res, next) => {
    const imagemId = req.params.id;
    const usuarioId = req.session.user.id; // Usuário logado

    let connection;
    try {
        connection = await db.getConnection();

        // 1. Encontra a imagem e o álbum ao qual ela pertence
        const [imagemAndAlbum] = await connection.query(
            `SELECT i.*, ia.AlbumID FROM IMAGENS i
             JOIN IMAGEM_ALBUNS ia ON i.ImagemID = ia.ImagemID
             WHERE i.ImagemID = ? LIMIT 1`,
            [imagemId]
        );

        if (imagemAndAlbum.length === 0) {
            return res.status(404).send('Imagem não encontrada.');
        }
        const imagem = imagemAndAlbum[0];
        const albumIdDaImagem = imagem.AlbumID;

        // 2. Verifica a permissão: É o dono da IMAGEM ou tem permissão de EDITAR no ÁLBUM
        const isOwnerOfImage = (imagem.UsuarioID === usuarioId);
        const canEditAlbum = await checkEditPermissionForAlbum(usuarioId, albumIdDaImagem, connection);

        if (!isOwnerOfImage && !canEditAlbum) {
            return res.status(403).send('Você não tem permissão para editar esta imagem.');
        }

        // Se chegou aqui, tem permissão (ou é dono ou pode editar o álbum)
        const [tagsForImageResult] = await connection.query(`
            SELECT t.Nome FROM TAGS t
            JOIN IMAGEM_TAGS it ON t.TagID = it.TagID
            WHERE it.ImagemID = ?`, [imagemId]);
        
        const tagsString = tagsForImageResult.map(tag => tag.Nome).join(', ');
        
        // NOVO: Busca todas as tags e categorias globais para o header
        const [allUserTags] = await connection.query('SELECT * FROM TAGS WHERE UsuarioID = ? ORDER BY Nome ASC', [usuarioId]);
        const [categorias] = await db.query("SELECT CategoriaID, Nome FROM CATEGORIAS ORDER BY Nome ASC");

        res.render('edit-image', {
            user: req.session.user,
            imagem: imagem,
            categorias: categorias, // Passa todas as categorias
            tags_string: tagsString,
            header_tags: allUserTags,
            header_categorias: categorias, // Passa todas as categorias para o header
            error: null
        });
    } catch (err) {
        console.error("Erro ao carregar a página de edição de imagem:", err);
        next(err);
    } finally {
        if (connection) connection.release();
    }
});

/* POST Rota para processar a atualização da imagem */
router.post('/imagem/:id/edit', checkAuth, async (req, res, next) => {
    const imagemId = req.params.id;
    const usuarioId = req.session.user.id; // Usuário logado
    const { descricao, categoria_id, tags } = req.body;

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Encontra a imagem e o álbum ao qual ela pertence
        const [imagemAndAlbum] = await connection.query(
            `SELECT i.UsuarioID, ia.AlbumID FROM IMAGENS i
             JOIN IMAGEM_ALBUNS ia ON i.ImagemID = ia.ImagemID
             WHERE i.ImagemID = ? LIMIT 1`,
            [imagemId]
        );

        if (imagemAndAlbum.length === 0) {
            await connection.rollback();
            return res.status(404).send('Imagem não encontrada.');
        }
        const imagemDonoId = imagemAndAlbum[0].UsuarioID;
        const albumIdDaImagem = imagemAndAlbum[0].AlbumID;

        // 2. Verifica a permissão: É o dono da IMAGEM ou tem permissão de EDITAR no ÁLBUM
        const isOwnerOfImage = (imagemDonoId === usuarioId);
        const canEditAlbum = await checkEditPermissionForAlbum(usuarioId, albumIdDaImagem, connection);

        if (!isOwnerOfImage && !canEditAlbum) {
            await connection.rollback();
            return res.status(403).send('Você não tem permissão para editar esta imagem.');
        }

        // 3. Atualiza os dados principais da imagem
        // Note: Se um amigo edita, o UsuarioID da imagem ainda é do dono original.
        await connection.query("UPDATE IMAGENS SET Descricao = ?, CategoriaID = ? WHERE ImagemID = ?", [descricao, categoria_id || null, imagemId]);

        // 4. Remove e adiciona as novas tags
        await connection.query('DELETE FROM IMAGEM_TAGS WHERE ImagemID = ?', [imagemId]);
        if (tags && tags.trim() !== '') {
            const tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
            for (const tagName of tagsArray) {
                // Ao criar/associar tags, elas sempre serão do UsuarioID que está fazendo a edição
                let [existingTag] = await connection.query('SELECT TagID FROM TAGS WHERE Nome = ? AND UsuarioID = ?', [tagName, usuarioId]);
                let tagId;
                if (existingTag.length > 0) {
                    tagId = existingTag[0].TagID;
                } else {
                    const [newTagResult] = await connection.query('INSERT INTO TAGS (Nome, UsuarioID) VALUES (?, ?)', [tagName, usuarioId]);
                    tagId = newTagResult.insertId;
                }
                await connection.query('INSERT INTO IMAGEM_TAGS (ImagemID, TagID) VALUES (?, ?)', [imagemId, tagId]);
            }
        }
        await connection.commit();

        const [albumLink] = await connection.query('SELECT AlbumID FROM IMAGEM_ALBUNS WHERE ImagemID = ? LIMIT 1', [imagemId]);
        if (albumLink.length > 0) {
            res.redirect(`/albuns/${albumLink[0].AlbumID}`);
        } else {
            res.redirect('/');
        }
    } catch (err) {
        await connection.rollback();
        console.error("Erro ao atualizar a imagem:", err);
        // NOVO: Melhorar a recuperação de dados em caso de erro
        try {
            const [imagemResult] = await db.query('SELECT * FROM IMAGENS WHERE ImagemID = ?', [imagemId]);
            const imagem = imagemResult.length > 0 ? imagemResult[0] : null;

            let tagsString = '';
            if (imagem) { // Se a imagem foi encontrada, tenta buscar as tags
                const [tagsForImageResult] = await db.query(`SELECT t.Nome FROM TAGS t JOIN IMAGEM_TAGS it ON t.TagID = it.TagID WHERE it.ImagemID = ?`, [imagemId]);
                tagsString = tagsForImageResult.map(tag => tag.Nome).join(', ');
            }

            const [allUserTags] = await db.query('SELECT * FROM TAGS WHERE UsuarioID = ? ORDER BY Nome ASC', [usuarioId]);
            const [categorias] = await db.query('SELECT CategoriaID, Nome FROM CATEGORIAS ORDER BY Nome ASC');

            res.render('edit-image', {
                user: req.session.user,
                imagem: imagem,
                tags_string: tagsString,
                header_tags: allUserTags,
                categorias: categorias,
                header_categorias: categorias,
                error: 'Erro ao salvar as alterações. Tente novamente: ' + err.message
            });
        } catch (renderError) {
            console.error("Erro ao re-renderizar página de edição após erro de atualização:", renderError);
            next(renderError);
        }
    } finally {
        if (connection) connection.release();
    }
});

/**
 * Rota POST para deletar uma imagem.
 * Acessada a partir do botão 'Deletar' em uma imagem específica.
 */
router.post('/imagem/:id/delete', checkAuth, async (req, res, next) => {
    const imagemId = req.params.id;
    const usuarioId = req.session.user.id; // Usuário logado
    const { albumId } = req.body; // Pega o ID do álbum para redirecionar de volta

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Encontra a imagem e o álbum ao qual ela pertence
        const [imagemAndAlbum] = await connection.query(
            `SELECT i.UsuarioID, i.NomeArquivo, ia.AlbumID FROM IMAGENS i
             JOIN IMAGEM_ALBUNS ia ON i.ImagemID = ia.ImagemID
             WHERE i.ImagemID = ? LIMIT 1`,
            [imagemId]
        );

        if (imagemAndAlbum.length === 0) {
            await connection.rollback();
            return res.status(404).send("Imagem não encontrada.");
        }
        const imagemDonoId = imagemAndAlbum[0].UsuarioID;
        const albumIdDaImagem = imagemAndAlbum[0].AlbumID;
        const nomeArquivo = imagemAndAlbum[0].NomeArquivo;

        // 2. Verifica a permissão: É o dono da IMAGEM ou tem permissão de EDITAR no ÁLBUM
        const isOwnerOfImage = (imagemDonoId === usuarioId);
        const canEditAlbum = await checkEditPermissionForAlbum(usuarioId, albumIdDaImagem, connection);

        if (!isOwnerOfImage && !canEditAlbum) {
            await connection.rollback();
            return res.status(403).send("Você não tem permissão para deletar esta imagem.");
        }

        // 3. Deleta a imagem do Cloudinary
        await cloudinary.uploader.destroy(nomeArquivo);

        // 4. Deleta a imagem do banco de dados.
        await connection.query('DELETE FROM IMAGENS WHERE ImagemID = ?', [imagemId]);

        await connection.commit();
        console.log(`Imagem ${imagemId} deletada com sucesso.`);
        
        // 5. Redireciona de volta para a página do álbum ou dashboard
        if(albumId) {
            res.redirect(`/albuns/${albumId}`);
        } else {
            res.redirect('/');
        }

    } catch (err) {
        await connection.rollback();
        console.error("Erro ao deletar imagem:", err);
        next(err);
    } finally {
        if (connection) connection.release();
    }
});


// Outras rotas como a galeria principal continuam aqui...
router.get('/', checkAuth, async (req, res) => {
    res.redirect('/');
});

module.exports = router;