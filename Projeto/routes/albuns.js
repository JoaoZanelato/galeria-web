// Importa o módulo express para criar rotas
const express = require("express");
// Cria um novo roteador do Express
const router = express.Router();
// Importa o módulo de acesso ao banco de dados
const db = require("../db/db");
// Importa o Cloudinary para manipulação de imagens
const { cloudinary } = require("../config/cloudinary");

// Middleware para verificar autenticação do usuário
function checkAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/auth/login");
  }
  next();
}

/* GET para a página de um álbum específico (Visualização do Álbum)
   Busca o álbum pelo ID, verifica se o usuário é dono ou tem permissão de acesso,
   carrega imagens, amigos do dono e compartilhamentos existentes.
*/
router.get("/:id", checkAuth, async function (req, res, next) {
  const albumId = req.params.id;
  const user = req.session.user;

  try {
    let albumToRender = null;
    let isAlbumOwner = false;
    let permissaoDoUsuario = "Não Compartilhado"; // Padrão

    // 1. Tenta buscar o álbum considerando o usuário logado como DONO
    const [ownerAlbumResult] = await db.query(
      "SELECT * FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?",
      [albumId, user.id]
    );

    if (ownerAlbumResult.length > 0) {
      albumToRender = ownerAlbumResult[0];
      isAlbumOwner = true;
    } else {
      // 2. Se não é o dono, tenta buscar o álbum como COMPARTILHADO com o usuário
      const [sharedAlbumResult] = await db.query(
        `SELECT a.*, c.Permissao
                 FROM ALBUNS a
                 JOIN COMPARTILHAMENTOS c ON a.AlbumID = c.AlbumID
                 WHERE c.AlbumID = ? AND c.UsuarioDestinatarioID = ? AND c.Permissao IN ('compartilhado', 'editavel')`,
        [albumId, user.id]
      );

      if (sharedAlbumResult.length > 0) {
        albumToRender = sharedAlbumResult[0];
        permissaoDoUsuario = sharedAlbumResult[0].Permissao;
      }
    }

    // Se o álbum não foi encontrado como dono nem como compartilhado, acesso negado
    if (!albumToRender) {
      return res
        .status(404)
        .send("Álbum não encontrado ou você não tem permissão para acessá-lo.");
    }

    // Pega todas as imagens associadas a este álbum
    const [imagens] = await db.query(
      "SELECT i.* FROM IMAGENS i JOIN IMAGEM_ALBUNS ia ON i.ImagemID = ia.ImagemID WHERE ia.AlbumID = ?",
      [albumId]
    );

    let amigosDoDono = [];
    let compartilhamentosExistentes = [];

    // Se o usuário é dono, busca amigos e compartilhamentos do álbum
    if (isAlbumOwner) {
      const donoId = albumToRender.UsuarioID;

      [amigosDoDono] = await db.query(
        `SELECT a.AmizadeID, u.UsuarioID, u.NomeUsuario
                 FROM AMIZADES a
                 JOIN USUARIOS u ON (a.UsuarioSolicitanteID = u.UsuarioID OR a.UsuarioAceitanteID = u.UsuarioID)
                 WHERE (a.UsuarioSolicitanteID = ? OR a.UsuarioAceitanteID = ?) AND a.Status = 'aceita'
                 AND u.UsuarioID != ?`,
        [donoId, donoId, donoId]
      );

      [compartilhamentosExistentes] = await db.query(
        `SELECT c.CompartilhamentoID, c.UsuarioDestinatarioID, u.NomeUsuario, c.Permissao
                 FROM COMPARTILHAMENTOS c
                 JOIN USUARIOS u ON c.UsuarioDestinatarioID = u.UsuarioID
                 WHERE c.AlbumID = ?`,
        [albumId]
      );
    }

    // Busca todas as tags e categorias do usuário para filtros
    const [allUserTags] = await db.query(
      "SELECT TagID, Nome FROM TAGS WHERE UsuarioID = ? ORDER BY Nome ASC",
      [user.id]
    );
    const [allCategorias] = await db.query(
      "SELECT CategoriaID, Nome FROM CATEGORIAS ORDER BY Nome ASC"
    );

    // Renderiza a página de detalhes do álbum
    res.render("album-detail", {
      user: user,
      album: albumToRender,
      imagens: imagens,
      isAlbumOwner: isAlbumOwner,
      permissaoDoUsuario: permissaoDoUsuario,
      amigosDoDono: amigosDoDono,
      compartilhamentosExistentes: compartilhamentosExistentes,
      tags: allUserTags,
      categorias: allCategorias,
      error: null,
      success: null,
    });
  } catch (err) {
    console.error("Erro ao buscar detalhes do álbum:", err);
    next(err);
  }
});

/* GET para a página de edição do álbum
   Permite ao dono editar nome e descrição do álbum.
*/
router.get("/:id/edit", checkAuth, async (req, res, next) => {
  const albumId = req.params.id;
  const usuarioId = req.session.user.id;

  try {
    const [albumResult] = await db.query(
      "SELECT * FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?",
      [albumId, usuarioId]
    );

    if (albumResult.length === 0) {
      return res
        .status(403)
        .send("Você não tem permissão para editar este álbum.");
    }

    res.render("edit-album", {
      user: req.session.user,
      album: albumResult[0],
      error: null,
    });
  } catch (err) {
    console.error("Erro ao carregar página de edição do álbum:", err);
    next(err);
  }
});

/* POST para atualizar o álbum (nome e descrição) */
router.post("/:id/edit", checkAuth, async (req, res, next) => {
  const albumId = req.params.id;
  const usuarioId = req.session.user.id;
  const { nome, descricao } = req.body;

  if (!nome) {
    const [albumResult] = await db.query(
      "SELECT * FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?",
      [albumId, usuarioId]
    );
    return res.render("edit-album", {
      user: req.session.user,
      album: albumResult[0],
      error: "O nome do álbum é obrigatório.",
    });
  }

  try {
    const [updateResult] = await db.query(
      "UPDATE ALBUNS SET Nome = ?, Descricao = ?, DataModificacao = NOW() WHERE AlbumID = ? AND UsuarioID = ?",
      [nome, descricao, albumId, usuarioId]
    );

    if (updateResult.affectedRows === 0) {
      return res
        .status(403)
        .send(
          "Você não tem permissão para editar este álbum ou o álbum não foi encontrado."
        );
    }

    res.redirect(`/albuns/${albumId}`);
  } catch (err) {
    console.error("Erro ao atualizar o álbum:", err);
    next(err);
  }
});

/* GET para a página de compartilhamento do álbum
   Permite ao dono compartilhar o álbum com amigos e gerenciar permissões.
*/
router.get("/:id/compartilhar", checkAuth, async function (req, res, next) {
  const albumId = req.params.id;
  const user = req.session.user;

  try {
    const [albumResult] = await db.query(
      "SELECT * FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?",
      [albumId, user.id]
    );
    const album = albumResult[0];

    if (!album) {
      return res
        .status(403)
        .send(
          "Você não tem permissão para gerenciar o compartilhamento deste álbum."
        );
    }

    // Busca amigos do dono do álbum
    const donoId = album.UsuarioID;
    const [amigosDoDono] = await db.query(
      `SELECT a.AmizadeID, u.UsuarioID, u.NomeUsuario
             FROM AMIZADES a
             JOIN USUARIOS u ON (a.UsuarioSolicitanteID = u.UsuarioID OR a.UsuarioAceitanteID = u.UsuarioID)
             WHERE (a.UsuarioSolicitanteID = ? OR a.UsuarioAceitanteID = ?) AND a.Status = 'aceita'
             AND u.UsuarioID != ?`,
      [donoId, donoId, donoId]
    );

    // Busca compartilhamentos já existentes do álbum
    const [compartilhamentosExistentes] = await db.query(
      `SELECT c.CompartilhamentoID, c.UsuarioDestinatarioID, u.NomeUsuario, c.Permissao
             FROM COMPARTILHAMENTOS c
             JOIN USUARIOS u ON c.UsuarioDestinatarioID = u.UsuarioID
             WHERE c.AlbumID = ?`,
      [albumId]
    );

    // Renderiza página de compartilhamento do álbum
    res.render("share-album", {
      title: "Compartilhar: " + album.Nome,
      user: user,
      album: album,
      amigosDoDono: amigosDoDono,
      compartilhamentosExistentes: compartilhamentosExistentes,
      error: null,
      success: null,
    });
  } catch (err) {
    console.error(
      "Erro ao carregar página de gerenciamento de compartilhamento:",
      err
    );
    next(err);
  }
});

/* POST para deletar um álbum
   Remove o álbum e as imagens associadas (se não estiverem em outros álbuns).
   Remove também do Cloudinary.
*/
router.post("/:id/delete", checkAuth, async (req, res, next) => {
  const albumId = req.params.id;
  const usuarioId = req.session.user.id;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Verifica se o usuário é dono do álbum
    const [albuns] = await connection.query(
      "SELECT * FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?",
      [albumId, usuarioId]
    );
    if (albuns.length === 0) {
      await connection.rollback();
      return res
        .status(403)
        .send("Você não tem permissão para deletar este álbum.");
    }

    // Busca imagens do álbum
    const [imagensNoAlbum] = await connection.query(
      "SELECT ImagemID, NomeArquivo FROM IMAGENS WHERE ImagemID IN (SELECT ImagemID FROM IMAGEM_ALBUNS WHERE AlbumID = ?)",
      [albumId]
    );

    // Para cada imagem, verifica se está em outros álbuns antes de deletar
    for (const imagem of imagensNoAlbum) {
      const [contagemAlbuns] = await connection.query(
        "SELECT COUNT(*) as count FROM IMAGEM_ALBUNS WHERE ImagemID = ?",
        [imagem.ImagemID]
      );

      if (contagemAlbuns[0].count === 1) {
        // Remove do Cloudinary
        await cloudinary.uploader.destroy(imagem.NomeArquivo);
        // Remove do banco
        await connection.query("DELETE FROM IMAGENS WHERE ImagemID = ?", [
          imagem.ImagemID,
        ]);
      }
    }

    // Remove o álbum do banco
    await connection.query("DELETE FROM ALBUNS WHERE AlbumID = ?", [albumId]);

    await connection.commit();
    res.redirect("/");
  } catch (err) {
    await connection.rollback();
    console.error("Erro ao deletar álbum:", err);
    next(err);
  } finally {
    if (connection) connection.release();
  }
});

/* POST para gerenciar compartilhamento de álbum
   Atualiza permissões de compartilhamento e emite eventos via websocket.
*/
router.post("/:id/share", checkAuth, async (req, res, next) => {
  const albumId = req.params.id;
  const ownerId = req.session.user.id;
  const io = req.io;
  const { compartilhamentos } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Verifica se o usuário é dono do álbum
    const [albumCheck] = await connection.query(
      "SELECT UsuarioID, Nome FROM ALBUNS WHERE AlbumID = ? AND UsuarioID = ?",
      [albumId, ownerId]
    );
    if (albumCheck.length === 0) {
      await connection.rollback();
      return res
        .status(403)
        .json({ message: "Você não tem permissão para gerenciar este álbum." });
    }
    const nomeAlbum = albumCheck[0].Nome;
    const nomeRemetente = req.session.user.nome;

    // Remove compartilhamentos antigos
    await connection.query("DELETE FROM COMPARTILHAMENTOS WHERE AlbumID = ?", [
      albumId,
    ]);

    // Adiciona novos compartilhamentos conforme permissões
    if (compartilhamentos && compartilhamentos.length > 0) {
      for (const comp of compartilhamentos) {
        // Se for 'nao_compartilhado', simplesmente não insere.
        if (
          comp.friendId &&
          ["compartilhado", "editavel"].includes(comp.permissao)
        ) {
          await connection.query(
            "INSERT INTO COMPARTILHAMENTOS (UsuarioRemetenteID, UsuarioDestinatarioID, AlbumID, Permissao) VALUES (?, ?, ?, ?)",
            [ownerId, comp.friendId, albumId, comp.permissao]
          );

          // Emite evento websocket para o destinatário
          io.to(comp.friendId.toString()).emit("novo_compartilhamento", {
            message: `${nomeRemetente} compartilhou o álbum "${nomeAlbum}" com você.`,
            tipo: "album",
          });
        }
      }
    }

    await connection.commit();
    res.status(200).json({
      success: true,
      message: "Permissões de compartilhamento atualizadas com sucesso!",
    });
  } catch (err) {
    await connection.rollback();
    console.error("Erro ao gerenciar compartilhamento de álbum:", err);
    res.status(500).json({
      success: false,
      message: "Erro interno ao atualizar permissões.",
    });
  } finally {
    if (connection) connection.release();
  }
});

// Exporta o roteador para ser usado em
