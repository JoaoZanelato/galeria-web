// Importação dos módulos necessários
const express = require("express"); // Framework para rotas e servidor web
const router = express.Router(); // Cria um roteador do Express
const multer = require("multer"); // Middleware para upload de arquivos
const { storage, cloudinary } = require("../config/cloudinary"); // Configuração do Cloudinary e storage para uploads
const upload = multer({ storage }); // Configura o multer para usar o Cloudinary
const db = require("../db/db"); // Pool de conexões com o banco de dados

// Middleware para verificar se o usuário está logado
function checkAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/auth/login");
  }
  next();
}

/**
 * Função auxiliar para verificar permissão de edição em um álbum.
 * Retorna true se o usuário for dono ou tiver permissão 'editavel' via compartilhamento.
 */
async function checkEditPermissionForAlbum(userId, albumId, connection) {
  // Verifica se o usuário é dono do álbum
  const [albumOwnerCheck] = await connection.query(
    "SELECT UsuarioID FROM ALBUNS WHERE AlbumID = ?",
    [albumId]
  );
  if (albumOwnerCheck.length > 0 && albumOwnerCheck[0].UsuarioID === userId) {
    return true;
  }
  // Verifica se o usuário tem permissão 'editavel' via compartilhamento
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
    // Busca álbuns do usuário
    const [meusAlbuns] = await db.query(
      "SELECT AlbumID, Nome FROM ALBUNS WHERE UsuarioID = ?",
      [userId]
    );
    // Busca álbuns compartilhados com permissão de edição
    const [albunsCompartilhadosEditaveis] = await db.query(
      `SELECT a.AlbumID, a.Nome, u.NomeUsuario AS DonoDoAlbum
       FROM ALBUNS a JOIN COMPARTILHAMENTOS c ON a.AlbumID = c.AlbumID JOIN USUARIOS u ON a.UsuarioID = u.UsuarioID
       WHERE c.UsuarioDestinatarioID = ? AND c.Permissao = 'editavel'`,
      [userId]
    );
    // Busca categorias disponíveis
    const [categorias] = await db.query(
      "SELECT CategoriaID, Nome FROM CATEGORIAS ORDER BY Nome ASC"
    );
    // Renderiza página de upload
    res.render("upload", {
      user: req.session.user,
      albuns: meusAlbuns
        .map((a) => ({ ...a, isShared: false, DonoDoAlbum: "Você" }))
        .concat(
          albunsCompartilhadosEditaveis.map((a) => ({ ...a, isShared: true }))
        ),
      categorias: categorias,
      header_tags: [], // Passando arrays vazios para o header
      header_categorias: [],
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
    // Extrai dados do formulário
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
      // Cria novo álbum se selecionado
      if (tipoAlbum === "novo" && album_novo_nome) {
        const [result] = await connection.query(
          "INSERT INTO ALBUNS (Nome, Descricao, UsuarioID) VALUES (?, ?, ?)",
          [album_novo_nome, album_novo_desc, usuarioID]
        );
        albumId = result.insertId;
      } else if (tipoAlbum === "existente" && album_existente) {
        albumId = album_existente;
        // Verifica permissão de edição
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
      // Insere imagem
      const [imagemResult] = await connection.query(
        "INSERT INTO IMAGENS (NomeArquivo, Url, Descricao, UsuarioID, CategoriaID) VALUES (?, ?, ?, ?, ?)",
        [filename, url, descricao, usuarioID, categoria_id || null]
      );
      const imagemId = imagemResult.insertId;
      // Relaciona imagem ao álbum
      await connection.query(
        "INSERT INTO IMAGEM_ALBUNS (ImagemID, AlbumID) VALUES (?, ?)",
        [imagemId, albumId]
      );
      // Processa tags
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
  const usuarioId = req.session.user.id; // Usuário logado
  const connection = await db.getConnection(); // Obter uma conexão

  try {
    // Primeiro, verifica se o usuário é o DONO da imagem
    const [imagemResult] = await connection.query(
      "SELECT * FROM IMAGENS WHERE ImagemID = ? AND UsuarioID = ?",
      [imagemId, usuarioId]
    );

    let canEditImage = false;
    let imagemToEdit = null;

    if (imagemResult.length > 0) {
      canEditImage = true; // É dono da imagem, pode editar
      imagemToEdit = imagemResult[0];
    } else {
      // Se não é dono da imagem, verifica se tem permissão 'editavel' no álbum
      const [albumLinks] = await connection.query(
        "SELECT AlbumID FROM IMAGEM_ALBUNS WHERE ImagemID = ? LIMIT 1",
        [imagemId]
      );

      if (albumLinks.length > 0) {
        const albumId = albumLinks[0].AlbumID;
        const albumEditPermission = await checkEditPermissionForAlbum(usuarioId, albumId, connection);
        
        if (albumEditPermission) {
          // Se tem permissão de edição no álbum, pode editar a imagem.
          // Busca a imagem sem a restrição de UsuarioID
          const [imgFromAlbum] = await connection.query(
            "SELECT * FROM IMAGENS WHERE ImagemID = ?",
            [imagemId]
          );
          if (imgFromAlbum.length > 0) {
            canEditImage = true;
            imagemToEdit = imgFromAlbum[0];
          }
        }
      }
    }

    if (!canEditImage || !imagemToEdit) {
      return res
        .status(403)
        .send("Você não tem permissão para editar esta imagem.");
    }

    // Busca tags associadas à imagem (independentemente de quem a editou)
    const [tagsAssociadas] = await connection.query(
      `SELECT t.Nome FROM TAGS t
       JOIN IMAGEM_TAGS it ON t.TagID = it.TagID
       WHERE it.ImagemID = ?`,
      [imagemId]
    );

    // Busca categorias e tags para o header (do usuário logado)
    const [header_categorias] = await connection.query(
      "SELECT * FROM CATEGORIAS ORDER BY Nome ASC"
    );
    const [header_tags] = await connection.query(
      `SELECT DISTINCT t.TagID, t.Nome
       FROM TAGS t
       WHERE t.UsuarioID = ? 
       ORDER BY t.Nome ASC`,
      [usuarioId]
    );

    // Renderiza página de edição
    res.render("edit-image", {
      user: req.session.user,
      imagem: imagemToEdit, // Usar a imagem encontrada
      header_tags: header_tags,
      header_categorias: header_categorias,
      categorias: header_categorias,
      tags_string: tagsAssociadas.map((t) => t.Nome).join(", "),
      error: null,
    });
  } catch (err) {
    console.error("Erro ao carregar página de edição de imagem:", err);
    next(err);
  } finally {
    if (connection) connection.release(); // Garante que a conexão seja liberada
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

    // 1. Verificar permissão de edição da imagem
    let canEditImage = false;
    
    // Verifica se é o dono da imagem
    const [imagemOwnerCheck] = await connection.query(
        "SELECT UsuarioID FROM IMAGENS WHERE ImagemID = ?",
        [imagemId]
    );

    if (imagemOwnerCheck.length > 0 && imagemOwnerCheck[0].UsuarioID === usuarioId) {
        canEditImage = true; // É dono da imagem
    } else {
        // Não é dono da imagem, verifica permissão de álbum
        const [albumLinks] = await connection.query(
            "SELECT AlbumID FROM IMAGEM_ALBUNS WHERE ImagemID = ? LIMIT 1",
            [imagemId]
        );
        if (albumLinks.length > 0) {
            const albumId = albumLinks[0].AlbumID;
            canEditImage = await checkEditPermissionForAlbum(usuarioId, albumId, connection);
        }
    }

    if (!canEditImage) {
      await connection.rollback();
      return res
        .status(403)
        .send("Você não tem permissão para editar esta imagem.");
    }

    // Atualiza dados da imagem (agora sem a restrição de UsuarioID na query de UPDATE)
    const [updateResult] = await connection.query(
      "UPDATE IMAGENS SET Descricao = ?, CategoriaID = ?, DataModificacao = NOW() WHERE ImagemID = ?",
      [descricao, categoria_id || null, imagemId]
    );

    if (updateResult.affectedRows === 0) {
      // Isso pode acontecer se a imagem não for encontrada, ou se não houve alteração nos dados
      console.warn(`Imagem ${imagemId} não atualizada. Possível inconsistência ou dados iguais.`);
    }

    // Remove tags antigas e adiciona novas (lógica existente e correta)
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
          [tagName, usuarioId] // Tags são do usuário que está editando
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

    // Redireciona para o álbum da imagem
    const [albumLink] = await connection.query(
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
  const albumIdFromForm = req.body.albumId; // Pegar o albumId do formulário, se disponível

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Verificar permissão para apagar a imagem
    let canDeleteImage = false;
    
    // Verifica se é o dono da imagem
    const [imagemOwnerCheck] = await connection.query(
        "SELECT UsuarioID, NomeArquivo FROM IMAGENS WHERE ImagemID = ?",
        [imagemId]
    );

    if (imagemOwnerCheck.length === 0) {
        await connection.rollback();
        return res.status(404).send("Imagem não encontrada.");
    }
    const imagemOwnerId = imagemOwnerCheck[0].UsuarioID;
    const nomeArquivo = imagemOwnerCheck[0].NomeArquivo; // Nome do arquivo Cloudinary

    if (imagemOwnerId === usuarioId) {
        canDeleteImage = true; // É dono da imagem
    } else {
        // Não é dono da imagem, verifica permissão de álbum
        let albumIdToUse = albumIdFromForm; // Tenta usar o ID do álbum enviado pelo formulário

        // Se o albumId não veio do form, tenta buscar a primeira associação da imagem a um álbum
        if (!albumIdToUse) {
            const [albumLinks] = await connection.query(
                "SELECT AlbumID FROM IMAGEM_ALBUNS WHERE ImagemID = ? LIMIT 1",
                [imagemId]
            );
            if (albumLinks.length > 0) {
                albumIdToUse = albumLinks[0].AlbumID;
            }
        }
        
        if (albumIdToUse) {
            canDeleteImage = await checkEditPermissionForAlbum(usuarioId, albumIdToUse, connection);
        }
    }

    if (!canDeleteImage) {
      await connection.rollback();
      return res
        .status(403)
        .send("Você não tem permissão para apagar esta imagem.");
    }

    // 2. Se a permissão foi concedida:
    // Remove a imagem da associação com o álbum, se ela veio de um álbum específico
    if (albumIdFromForm) {
        await connection.query("DELETE FROM IMAGEM_ALBUNS WHERE ImagemID = ? AND AlbumID = ?", [
            imagemId, albumIdFromForm
        ]);
    } else {
        // Se a imagem não veio de um contexto de álbum específico, ou se não tem mais links,
        // apenas remove todas as associações para essa imagem (cenário de deleção global ou de imagens sem álbum)
        await connection.query("DELETE FROM IMAGEM_ALBUNS WHERE ImagemID = ?", [imagemId]);
    }

    // Verifica se a imagem ainda está associada a algum álbum ou se é uma imagem individual compartilhada
    const [remainingAlbumLinks] = await connection.query(
        "SELECT COUNT(*) AS count FROM IMAGEM_ALBUNS WHERE ImagemID = ?",
        [imagemId]
    );
    const [remainingShares] = await connection.query(
        "SELECT COUNT(*) AS count FROM COMPARTILHAMENTOS WHERE ImagemID = ?",
        [imagemId]
    );

    // Deleta a imagem do Cloudinary e da tabela IMAGENS APENAS SE ELA NÃO ESTIVER MAIS EM NENHUM ÁLBUM OU COMPARTILHAMENTO INDIVIDUAL
    if (remainingAlbumLinks[0].count === 0 && remainingShares[0].count === 0) {
        await cloudinary.uploader.destroy(nomeArquivo);
        await connection.query("DELETE FROM IMAGENS WHERE ImagemID = ?", [imagemId]);
    } else {
        // Se a imagem ainda tem links ou compartilhamentos, apenas remove as tags dela para evitar lixo
        await connection.query("DELETE FROM IMAGEM_TAGS WHERE ImagemID = ?", [imagemId]);
    }

    await connection.commit();

    // Redireciona para página anterior ou home
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

// GET: Exibe página de compartilhamento de imagem
router.get("/imagem/:id/share", checkAuth, async (req, res, next) => {
  const imagemId = req.params.id;
  const ownerId = req.session.user.id;

  try {
    // Busca imagem do usuário
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

    // Busca amigos do usuário
    const [amigos] = await db.query(
      `SELECT u.UsuarioID, u.NomeUsuario FROM AMIZADES a
       JOIN USUARIOS u ON (a.UsuarioSolicitanteID = u.UsuarioID OR a.UsuarioAceitanteID = u.UsuarioID)
       WHERE (a.UsuarioSolicitanteID = ? OR a.UsuarioAceitanteID = ?) AND a.Status = 'aceita' AND u.UsuarioID != ?`,
      [ownerId, ownerId, ownerId]
    );

    // Busca compartilhamentos já existentes para a imagem
    const [compartilhamentosExistentes] = await db.query(
      `SELECT c.UsuarioDestinatarioID, c.Permissao FROM COMPARTILHAMENTOS c
       WHERE c.ImagemID = ?`,
      [imagemId]
    );

    // Renderiza página de compartilhamento
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

// POST: Processa compartilhamento de imagem
router.post("/imagem/:id/share", checkAuth, async (req, res, next) => {
  const imagemId = req.params.id;
  const ownerId = req.session.user.id;
  const { compartilhamentos } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Verifica se a imagem pertence ao usuário
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

    // Remove compartilhamentos antigos
    await connection.query("DELETE FROM COMPARTILHAMENTOS WHERE ImagemID = ?", [
      imagemId,
    ]);

    // Adiciona novos compartilhamentos
    if (compartilhamentos && Array.isArray(compartilhamentos)) {
      for (const comp of compartilhamentos) {
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

    // Redireciona para o álbum da imagem
    const [albumLink] = await connection.query(
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

// Redireciona rota raiz para home
router.get("/", checkAuth, async (req, res) => {
  res.redirect("/");
});

// Exporta o router para uso no app principal
module.exports = router;