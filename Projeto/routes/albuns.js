const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { cloudinary } = require('../config/cloudinary'); // Importar cloudinary

// Middleware para verificar autenticação (você já deve ter um similar)
function checkAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}


/* GET para a página de um álbum específico (Visualização do Álbum) */
router.get('/:id', checkAuth, async function(req, res, next) {
    const albumId = req.params.id;
    const user = req.session.user; // O usuário logado que está acessando a página

    if (!user) {
        return res.redirect('/auth/login');
    }

    try {
        let albumToRender = null; // Variável que conterá o objeto do álbum a ser renderizado
        let isAlbumOwner = false; // Indica se o usuário logado é o dono do álbum
        let permissaoDoUsuario = null; // Guardará a permissão do usuário logado (se for compartilhado)

        // 1. Tenta buscar o álbum considerando o usuário logado como DONO
        const [ownerAlbumResult] = await db.query('SELECT * FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?', [albumId, user.id]);

        if (ownerAlbumResult.length > 0) {
            albumToRender = ownerAlbumResult[0];
            isAlbumOwner = true;
        } else {
            // 2. Se não é o dono, tenta buscar o álbum como COMPARTILHADO com o usuário
            const [sharedAlbumResult] = await db.query(
                `SELECT a.*, c.Permissao
                 FROM ALBUNS a
                 JOIN COMPARTILHAMENTOS c ON a.AlbumID = c.AlbumID
                 WHERE c.AlbumID = ? AND c.UsuarioDestinatarioID = ? AND c.Permissao IN ('visualizar', 'editar')`,
                [albumId, user.id]
            );

            if (sharedAlbumResult.length > 0) {
                albumToRender = sharedAlbumResult[0]; // 'albumToRender' agora contém os dados do álbum compartilhado
                permissaoDoUsuario = sharedAlbumResult[0].Permissao; // Pega a permissão específica
            }
        }

        // Se o álbum não foi encontrado como dono nem como compartilhado, acesso negado
        if (!albumToRender) {
            return res.status(404).send('Álbum não encontrado ou você não tem permissão para acessá-lo.');
        }

        // Pega todas as imagens associadas a este álbum (independentemente de ser dono ou compartilhado)
        const [imagens] = await db.query(
            'SELECT i.* FROM IMAGENS i JOIN IMAGEM_ALBUNS ia ON i.ImagemID = ia.ImagemID WHERE ia.AlbumID = ?',
            [albumId]
        );

        // Se o usuário que está acessando é o DONO do álbum, busca amigos e compartilhamentos existentes
        let amigosDoDono = []; // Lista de amigos aceitos do dono do álbum
        let compartilhamentosExistentes = []; // Compartilhamentos atuais configurados para este álbum

        if (isAlbumOwner) {
            const donoId = albumToRender.UsuarioID; // O ID do dono do álbum
            
            // Busca todos os amigos aceitos do DONO do álbum
            [amigosDoDono] = await db.query(
                `SELECT a.AmizadeID, u.UsuarioID, u.NomeUsuario
                 FROM AMIZADES a
                 JOIN USUARIOS u ON (a.UsuarioSolicitanteID = u.UsuarioID OR a.UsuarioAceitanteID = u.UsuarioID)
                 WHERE (a.UsuarioSolicitanteID = ? OR a.UsuarioAceitanteID = ?) AND a.Status = 'aceita'
                 AND u.UsuarioID != ?`, // Exclui o próprio dono da lista de amigos para compartilhamento
                [donoId, donoId, donoId]
            );

            // Busca os compartilhamentos já feitos para este álbum
            [compartilhamentosExistentes] = await db.query(
                `SELECT c.CompartilhamentoID, c.UsuarioDestinatarioID, u.NomeUsuario, c.Permissao
                 FROM COMPARTILHAMENTOS c
                 JOIN USUARIOS u ON c.UsuarioDestinatarioID = u.UsuarioID
                 WHERE c.AlbumID = ?`,
                [albumId]
            );
        }

        // NOVO: Buscar todas as tags do usuário logado e todas as categorias para o header
        const [allUserTags] = await db.query('SELECT TagID, Nome FROM TAGS WHERE UsuarioID = ? ORDER BY Nome ASC', [user.id]);
        const [allCategorias] = await db.query('SELECT CategoriaID, Nome FROM CATEGORIAS ORDER BY Nome ASC');


        res.render('album-detail', {
            user: user,
            album: albumToRender, // Passa o objeto do álbum para a view
            imagens: imagens,
            isAlbumOwner: isAlbumOwner, // Flag para controlar UI no EJS
            permissaoDoUsuario: permissaoDoUsuario, // Permissão do usuário logado (se não for dono)
            amigosDoDono: amigosDoDono, // Lista de amigos do dono (só se isAlbumOwner for true)
            compartilhamentosExistentes: compartilhamentosExistentes, // Compartilhamentos existentes (só se isAlbumOwner for true)
            tags: allUserTags, // Passa todas as tags do usuário para o header
            categorias: allCategorias, // Passa todas as categorias para o header
            error: null,
            success: null
        });

    } catch (err) {
        console.error("Erro ao buscar detalhes do álbum:", err);
        next(err);
    }
});


// NOVA ROTA GET PARA A PÁGINA DE EDIÇÃO DO ÁLBUM
router.get('/:id/edit', checkAuth, async (req, res, next) => {
    const albumId = req.params.id;
    const usuarioId = req.session.user.id;

    try {
        const [albumResult] = await db.query(
            'SELECT * FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?',
            [albumId, usuarioId]
        );

        if (albumResult.length === 0) {
            return res.status(403).send('Você não tem permissão para editar este álbum.');
        }

        res.render('edit-album', {
            user: req.session.user,
            album: albumResult[0],
            error: null
        });

    } catch (err) {
        console.error('Erro ao carregar página de edição do álbum:', err);
        next(err);
    }
});

// NOVA ROTA POST PARA ATUALIZAR O ÁLBUM
router.post('/:id/edit', checkAuth, async (req, res, next) => {
    const albumId = req.params.id;
    const usuarioId = req.session.user.id;
    const { nome, descricao } = req.body;

    if (!nome) {
        // Recarrega a página com erro se o nome estiver vazio
        const [albumResult] = await db.query('SELECT * FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?', [albumId, usuarioId]);
        return res.render('edit-album', {
            user: req.session.user,
            album: albumResult[0],
            error: 'O nome do álbum é obrigatório.'
        });
    }

    try {
        // Garante que o usuário é o dono antes de atualizar
        const [updateResult] = await db.query(
            'UPDATE ALBUNS SET Nome = ?, Descricao = ?, DataModificacao = NOW() WHERE AlbumID = ? AND UsuarioID = ?',
            [nome, descricao, albumId, usuarioId]
        );

        if (updateResult.affectedRows === 0) {
            return res.status(403).send('Você não tem permissão para editar este álbum ou o álbum não foi encontrado.');
        }

        res.redirect(`/albuns/${albumId}`);

    } catch (err) {
        console.error('Erro ao atualizar o álbum:', err);
        next(err);
    }
});


/**
 * Rota GET para a página de gerenciamento de compartilhamento de um álbum específico.
 * Apenas o dono do álbum pode acessar esta página.
 */
router.get('/:id/compartilhar', async function(req, res, next) {
    const albumId = req.params.id;
    const user = req.session.user; // O usuário logado

    if (!user) {
        return res.redirect('/auth/login');
    }

    try {
        // 1. Verifica se o usuário logado é o DONO do álbum
        const [albumResult] = await db.query('SELECT * FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?', [albumId, user.id]);
        const album = albumResult[0];

        if (!album) {
            // Se o usuário não é o dono, ele não pode gerenciar o compartilhamento
            return res.status(403).send('Você não tem permissão para gerenciar o compartilhamento deste álbum.');
        }

        // 2. Busca todos os amigos aceitos do DONO do álbum
        const donoId = album.UsuarioID;
        const [amigosDoDono] = await db.query(
            `SELECT a.AmizadeID, u.UsuarioID, u.NomeUsuario
             FROM AMIZADES a
             JOIN USUARIOS u ON (a.UsuarioSolicitanteID = u.UsuarioID OR a.UsuarioAceitanteID = u.UsuarioID)
             WHERE (a.UsuarioSolicitanteID = ? OR a.UsuarioAceitanteID = ?) AND a.Status = 'aceita'
             AND u.UsuarioID != ?`, // Exclui o próprio dono
            [donoId, donoId, donoId]
        );

        // 3. Busca os compartilhamentos já feitos para este álbum
        const [compartilhamentosExistentes] = await db.query(
            `SELECT c.CompartilhamentoID, c.UsuarioDestinatarioID, u.NomeUsuario, c.Permissao
             FROM COMPARTILHAMENTOS c
             JOIN USUARIOS u ON c.UsuarioDestinatarioID = u.UsuarioID
             WHERE c.AlbumID = ?`,
            [albumId]
        );

        res.render('share-album', {
            title: 'Compartilhar: ' + album.Nome, // Título da página
            user: user,
            album: album, // Passa os detalhes do álbum para a view
            amigosDoDono: amigosDoDono, // Lista de amigos para compartilhar
            compartilhamentosExistentes: compartilhamentosExistentes, // Compartilhamentos atuais
            error: null,
            success: null
        });

    } catch (err) {
        console.error("Erro ao carregar página de gerenciamento de compartilhamento:", err);
        next(err);
    }
});


/**
 * Rota POST para deletar um álbum e suas imagens associadas (se se tornarem órfãs).
 * APENAS O DONO DO ÁLBUM PODE DELETÁ-LO.
 */
router.post('/:id/delete', async (req, res, next) => {
    const albumId = req.params.id;
    const usuarioId = req.session.user.id; // O usuário que está tentando deletar

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Verifica se o álbum pertence ao usuário logado (dono)
        const [albuns] = await connection.query('SELECT * FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?', [albumId, usuarioId]);
        if (albuns.length === 0) {
            await connection.rollback();
            return res.status(403).send("Você não tem permissão para deletar este álbum.");
        }

        // 2. Encontra todas as imagens no álbum que será deletado
        const [imagensNoAlbum] = await connection.query(
            'SELECT ImagemID, NomeArquivo FROM IMAGENS WHERE ImagemID IN (SELECT ImagemID FROM IMAGEM_ALBUNS WHERE AlbumID = ?)',
            [albumId]
        );

        // 3. Para cada imagem, verifica se ela se tornará órfã e a deleta se necessário
        for (const imagem of imagensNoAlbum) {
            // Conta em quantos álbuns a imagem está
            const [contagemAlbuns] = await connection.query('SELECT COUNT(*) as count FROM IMAGEM_ALBUNS WHERE ImagemID = ?', [imagem.ImagemID]);

            // Se a imagem só está neste álbum, ela se tornará órfã e deve ser deletada
            if (contagemAlbuns[0].count === 1) {
                console.log(`Imagem ${imagem.ImagemID} se tornará órfã. Deletando do Cloudinary e DB...`);
                // Deleta do Cloudinary
                await cloudinary.uploader.destroy(imagem.NomeArquivo);
                // Deleta do banco de dados (ON DELETE CASCADE cuidará das associações)
                await connection.query('DELETE FROM IMAGENS WHERE ImagemID = ?', [imagem.ImagemID]);
            }
        }

        // 4. Deleta o álbum. A tabela IMAGEM_ALBUNS (associações) será limpa automaticamente pelo ON DELETE CASCADE.
        // COMPARTILHAMENTOS também será limpo se tiver FOREIGN KEY com ON DELETE CASCADE para AlbumID.
        await connection.query('DELETE FROM ALBUNS WHERE AlbumID = ?', [albumId]);

        await connection.commit();
        console.log(`Álbum ${albumId} deletado com sucesso.`);
        res.redirect('/'); // Redireciona para o dashboard principal

    } catch (err) {
        await connection.rollback();
        console.error("Erro ao deletar álbum:", err);
        next(err);
    } finally {
        if (connection) connection.release();
    }
});

/**
 * Rota POST para gerenciar compartilhamento de álbum.
 * Apenas o dono do álbum pode usar esta rota.
 */
router.post('/:id/share', async (req, res, next) => {
    const albumId = req.params.id;
    const ownerId = req.session.user.id; // O usuário logado deve ser o dono do álbum
    const io = req.io;

    // Esperamos um array de objetos, onde cada objeto tem { friendId, permissao }
    const { compartilhamentos } = req.body;

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Verifica se o usuário logado é realmente o dono do álbum
        const [albumCheck] = await connection.query('SELECT UsuarioID, Nome FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?', [albumId, ownerId]);
        if (albumCheck.length === 0) {
            await connection.rollback();
            return res.status(403).json({ message: 'Você não tem permissão para gerenciar este álbum.' });
        }
        const nomeAlbum = albumCheck[0].Nome;
        const nomeRemetente = req.session.user.nome;

        // 2. Remove todos os compartilhamentos existentes para este álbum primeiro,
        // e depois adiciona os novos/atualizados.
        // Isso simplifica a lógica de atualização.
        await connection.query('DELETE FROM COMPARTILHAMENTOS WHERE AlbumID = ?', [albumId]);

        // 3. Adiciona os novos compartilhamentos
        if (compartilhamentos && compartilhamentos.length > 0) {
            for (const comp of compartilhamentos) {
                // Valida os dados recebidos antes de inserir
                if (comp.friendId && comp.permissao && ['visualizar', 'baixar', 'editar'].includes(comp.permissao)) {
                    await connection.query(
                        'INSERT INTO COMPARTILHAMENTOS (UsuarioRemetenteID, UsuarioDestinatarioID, AlbumID, Permissao) VALUES (?, ?, ?, ?)',
                        [ownerId, comp.friendId, albumId, comp.permissao]
                    );

                    // EMITIR EVENTO WEBSOCKET
                    io.to(comp.friendId.toString()).emit('novo_compartilhamento', {
                        message: `${nomeRemetente} compartilhou o álbum "${nomeAlbum}" com você.`,
                        tipo: 'album'
                    });
                } else {
                    console.warn(`Compartilhamento inválido ignorado para AlbumID ${albumId}:`, comp);
                }
            }
        }

        await connection.commit();
        res.status(200).json({ success: true, message: 'Permissões de compartilhamento atualizadas com sucesso!' });

    } catch (err) {
        await connection.rollback();
        console.error('Erro ao gerenciar compartilhamento de álbum:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar permissões.' });
    } finally {
        if (connection) connection.release();
    }
});


module.exports = router;