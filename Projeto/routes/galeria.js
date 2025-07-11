const express = require("express");
const router = express.Router();
const multer = require("multer");
const { storage, cloudinary } = require("../config/cloudinary");
const upload = multer({ storage });
const db = require("../db/db");

// Middleware para verificar se o usuário está logado
function checkAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/auth/login");
  }
  next();
}

/**
 * Função auxiliar para verificar permissão de edição em um álbum.
 */
async function checkEditPermissionForAlbum(userId, albumId, connection) {
  // 1. Verificar se o usuário é o dono do álbum
  const [albumOwnerCheck] = await connection.query(
    "SELECT UsuarioID FROM ALBUNS WHERE AlbumID = ?",
    [albumId]
  );
  if (albumOwnerCheck.length > 0 && albumOwnerCheck[0].UsuarioID === userId) {
    return true;
  }
  // 2. Se não é o dono, verificar se tem permissão de 'editavel'
  const [permissionCheck] = await connection.query(
    `SELECT CompartilhamentoID FROM COMPARTILHAMENTOS
         WHERE AlbumID = ? AND UsuarioDestinatarioID = ? AND Permissao = 'editavel'`,
    [albumId, userId]
  );
  return permissionCheck.length > 0;
}

/* GET Rota para exibir a página de upload */
router.get("/upload", checkAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [meusAlbuns] = await db.query(
      "SELECT AlbumID, Nome FROM ALBUNS WHERE UsuarioID = ?",
      [userId]
    );
    const [albunsCompartilhadosEditaveis] = await db.query(
      `SELECT a.AlbumID, a.Nome, u.NomeUsuario AS DonoDoAlbum
             FROM ALBUNS a JOIN COMPARTILHAMENTOS c ON a.AlbumID = c.AlbumID JOIN USUARIOS u ON a.UsuarioID = u.UsuarioID
             WHERE c.UsuarioDestinatarioID = ? AND c.Permissao = 'editavel'`,
      [userId]
    );
    const [categorias] = await db.query(
      "SELECT CategoriaID, Nome FROM CATEGORIAS ORDER BY Nome ASC"
    );
    res.render("upload", {
      user: req.session.user,
      albuns: meusAlbuns
        .map((a) => ({ ...a, isShared: false, DonoDoAlbum: "Você" }))
        .concat(
          albunsCompartilhadosEditaveis.map((a) => ({ ...a, isShared: true }))
        ),
      categorias: categorias,
    });
  } catch (err) {
    console.error("Erro ao carregar a página de upload:", err);
    res.status(500).send("Erro ao carregar a página.");
  }
});

/* POST Rota para processar o upload da imagem */
router.post(
  "/upload",
  checkAuth,
  upload.single("imagem"),
  async (req, res, next) => {
    const {
      descricao,
      tipoAlbum,
      album_existente,
      album_novo_nome,
      album_novo_desc,
      tags,
      categoria_id,
    } = req.body;
    const { path: url, filename } = req.file;
    const usuarioID = req.session.user.id;
    let albumId;

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      if (tipoAlbum === "novo" && album_novo_nome) {
        const [result] = await connection.query(
          "INSERT INTO ALBUNS (Nome, Descricao, UsuarioID) VALUES (?, ?, ?)",
          [album_novo_nome, album_novo_desc, usuarioID]
        );
        albumId = result.insertId;
      } else if (tipoAlbum === "existente" && album_existente) {
        albumId = album_existente;
        const canEdit = await checkEditPermissionForAlbum(
          usuarioID,
          albumId,
          connection
        );
        if (!canEdit)
          throw new Error(
            "Você não tem permissão para adicionar imagens a este álbum."
          );
      } else {
        throw new Error(
          "Você deve selecionar um álbum existente ou criar um novo."
        );
      }
      const [imagemResult] = await connection.query(
        "INSERT INTO IMAGENS (NomeArquivo, Url, Descricao, UsuarioID, CategoriaID) VALUES (?, ?, ?, ?, ?)",
        [filename, url, descricao, usuarioID, categoria_id || null]
      );
      const imagemId = imagemResult.insertId;
      await connection.query(
        "INSERT INTO IMAGEM_ALBUNS (ImagemID, AlbumID) VALUES (?, ?)",
        [imagemId, albumId]
      );
      if (tags && tags.trim() !== "") {
        const tagsArray = tags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag !== "");
        for (const tagName of tagsArray) {
          let [existingTags] = await connection.query(
            "SELECT TagID FROM TAGS WHERE Nome = ? AND UsuarioID = ?",
            [tagName, usuarioID]
          );
          let tagId;
          if (existingTags.length > 0) {
            tagId = existingTags[0].TagID;
          } else {
            const [newTagResult] = await connection.query(
              "INSERT INTO TAGS (Nome, UsuarioID) VALUES (?, ?)",
              [tagName, usuarioID]
            );
            tagId = newTagResult.insertId;
          }
          await connection.query(
            "INSERT INTO IMAGEM_TAGS (ImagemID, TagID) VALUES (?, ?)",
            [imagemId, tagId]
          );
        }
      }
      await connection.commit();
      res.redirect(`/albuns/${albumId}`);
    } catch (err) {
      await connection.rollback();
      next(err);
    } finally {
      if (connection) connection.release();
    }
  }
);

// --- Rotas de Edição e Exclusão da imagem ---

// GET: Rota para exibir o formulário de edição de uma imagem
router.get("/imagem/:id/edit", checkAuth, async (req, res, next) => {
  const imagemId = req.params.id;
  const usuarioId = req.session.user.id;

  try {
    const [imagemResult] = await db.query(
      "SELECT * FROM IMAGENS WHERE ImagemID = ? AND UsuarioID = ?",
      [imagemId, usuarioId]
    );

    if (imagemResult.length === 0) {
      return res
        .status(403)
        .send("Você não tem permissão para editar esta imagem.");
    }

    const [categorias] = await db.query(
      "SELECT * FROM CATEGORIAS ORDER BY Nome ASC"
    );
    const [tagsAssociadas] = await db.query(
      `SELECT t.Nome FROM TAGS t
             JOIN IMAGEM_TAGS it ON t.TagID = it.TagID
             WHERE it.ImagemID = ?`,
      [imagemId]
    );

    res.render("edit-image", {
      user: req.session.user,
      imagem: imagemResult[0],
      categorias: categorias,
      tagsAtuais: tagsAssociadas.map((t) => t.Nome).join(", "),
      error: null,
    });
  } catch (err) {
    console.error("Erro ao carregar página de edição de imagem:", err);
    next(err);
  }
});

// POST: Rota para processar a atualização da imagem
router.post("/imagem/:id/edit", checkAuth, async (req, res, next) => {
  const imagemId = req.params.id;
  const usuarioId = req.session.user.id;
  const { descricao, categoria_id, tags } = req.body;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [updateResult] = await connection.query(
      "UPDATE IMAGENS SET Descricao = ?, CategoriaID = ?, DataModificacao = NOW() WHERE ImagemID = ? AND UsuarioID = ?",
      [descricao, categoria_id || null, imagemId, usuarioId]
    );

    if (updateResult.affectedRows === 0) {
      throw new Error(
        "Você não tem permissão para editar esta imagem ou a imagem não foi encontrada."
      );
    }

    await connection.query("DELETE FROM IMAGEM_TAGS WHERE ImagemID = ?", [
      imagemId,
    ]);
    if (tags && tags.trim() !== "") {
      const tagsArray = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "");
      for (const tagName of tagsArray) {
        let [existingTags] = await connection.query(
          "SELECT TagID FROM TAGS WHERE Nome = ? AND UsuarioID = ?",
          [tagName, usuarioId]
        );
        let tagId;
        if (existingTags.length > 0) {
          tagId = existingTags[0].TagID;
        } else {
          const [newTagResult] = await connection.query(
            "INSERT INTO TAGS (Nome, UsuarioID) VALUES (?, ?)",
            [tagName, usuarioId]
          );
          tagId = newTagResult.insertId;
        }
        await connection.query(
          "INSERT INTO IMAGEM_TAGS (ImagemID, TagID) VALUES (?, ?)",
          [imagemId, tagId]
        );
      }
    }

    await connection.commit();

    const [albumLink] = await db.query(
      "SELECT AlbumID FROM IMAGEM_ALBUNS WHERE ImagemID = ? LIMIT 1",
      [imagemId]
    );
    if (albumLink.length > 0) {
      res.redirect(`/albuns/${albumLink[0].AlbumID}`);
    } else {
      res.redirect("/");
    }
  } catch (err) {
    await connection.rollback();
    console.error("Erro ao atualizar a imagem:", err);
    next(err);
  } finally {
    if (connection) connection.release();
  }
});

// POST: Rota para apagar uma imagem
router.post("/imagem/:id/delete", checkAuth, async (req, res, next) => {
  const imagemId = req.params.id;
  const usuarioId = req.session.user.id;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [imagemResult] = await connection.query(
      "SELECT NomeArquivo FROM IMAGENS WHERE ImagemID = ? AND UsuarioID = ?",
      [imagemId, usuarioId]
    );

    if (imagemResult.length === 0) {
      await connection.rollback();
      return res
        .status(403)
        .send("Você não tem permissão para apagar esta imagem.");
    }

    const nomeArquivo = imagemResult[0].NomeArquivo;

    await cloudinary.uploader.destroy(nomeArquivo);
    await connection.query("DELETE FROM IMAGENS WHERE ImagemID = ?", [
      imagemId,
    ]);

    await connection.commit();

    const redirectUrl = req.headers.referer || "/";
    res.redirect(redirectUrl);
  } catch (err) {
    await connection.rollback();
    console.error("Erro ao apagar a imagem:", err);
    next(err);
  } finally {
    if (connection) connection.release();
  }
});

// ===================================================================
//      ROTAS PARA COMPARTILHAMENTO DE IMAGEM INDIVIDUAL
// ===================================================================

/**
 * GET Rota para exibir a página de compartilhamento de uma imagem.
 */
router.get("/imagem/:id/share", checkAuth, async (req, res, next) => {
  const imagemId = req.params.id;
  const ownerId = req.session.user.id;

  try {
    const [imagemResult] = await db.query(
      "SELECT ImagemID, Url, Descricao FROM IMAGENS WHERE ImagemID = ? AND UsuarioID = ?",
      [imagemId, ownerId]
    );

    if (imagemResult.length === 0) {
      return res
        .status(403)
        .send(
          "Imagem não encontrada ou você não tem permissão para compartilhá-la."
        );
    }
    const imagem = imagemResult[0];

    const [amigos] = await db.query(
      `SELECT u.UsuarioID, u.NomeUsuario FROM AMIZADES a
             JOIN USUARIOS u ON (a.UsuarioSolicitanteID = u.UsuarioID OR a.UsuarioAceitanteID = u.UsuarioID)
             WHERE (a.UsuarioSolicitanteID = ? OR a.UsuarioAceitanteID = ?) AND a.Status = 'aceita' AND u.UsuarioID != ?`,
      [ownerId, ownerId, ownerId]
    );

    const [compartilhamentosExistentes] = await db.query(
      `SELECT c.UsuarioDestinatarioID, c.Permissao FROM COMPARTILHAMENTOS c
             WHERE c.ImagemID = ?`,
      [imagemId]
    );

    res.render("share-image", {
      user: req.session.user,
      imagem: imagem,
      amigos: amigos,
      compartilhamentos: compartilhamentosExistentes,
      error: null,
      success: null,
    });
  } catch (err) {
    console.error(
      "Erro ao carregar a página de compartilhamento de imagem:",
      err
    );
    next(err);
  }
});

/**
 * POST Rota para processar o compartilhamento de uma imagem.
 */
router.post("/imagem/:id/share", checkAuth, async (req, res, next) => {
  const imagemId = req.params.id;
  const ownerId = req.session.user.id;
  const { compartilhamentos } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [imagemCheck] = await connection.query(
      "SELECT ImagemID FROM IMAGENS WHERE ImagemID = ? AND UsuarioID = ?",
      [imagemId, ownerId]
    );
    if (imagemCheck.length === 0) {
      await connection.rollback();
      return res
        .status(403)
        .send("Você não tem permissão para gerenciar esta imagem.");
    }

    await connection.query("DELETE FROM COMPARTILHAMENTOS WHERE ImagemID = ?", [
      imagemId,
    ]);

    if (compartilhamentos && Array.isArray(compartilhamentos)) {
      for (const comp of compartilhamentos) {
        // Apenas insere se a permissão for 'compartilhado' ou 'editavel'
        if (
          comp.friendId &&
          ["compartilhado", "editavel"].includes(comp.permissao)
        ) {
          await connection.query(
            "INSERT INTO COMPARTILHAMENTOS (UsuarioRemetenteID, UsuarioDestinatarioID, ImagemID, AlbumID, Permissao) VALUES (?, ?, ?, NULL, ?)",
            [ownerId, comp.friendId, imagemId, comp.permissao]
          );
        }
      }
    }

    await connection.commit();

    const [albumLink] = await db.query(
      "SELECT AlbumID FROM IMAGEM_ALBUNS WHERE ImagemID = ? LIMIT 1",
      [imagemId]
    );
    if (albumLink.length > 0) {
      res.redirect(`/albuns/${albumLink[0].AlbumID}`);
    } else {
      res.redirect("/");
    }
  } catch (err) {
    await connection.rollback();
    console.error("Erro ao salvar compartilhamento de imagem:", err);
    next(err);
  } finally {
    if (connection) connection.release();
  }
});

router.get("/", checkAuth, async (req, res) => {
  res.redirect("/");
});

module.exports = router;
