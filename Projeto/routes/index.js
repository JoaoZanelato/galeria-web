var express = require("express");
var router = express.Router();
const db = require("../db/db"); // Importe a conexão com o banco

// Middleware para verificar se o usuário está logado
function checkAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/auth/login");
  }
  next();
}

/* GET home page (dashboard). */
router.get("/", async function (req, res, next) {
  const user = req.session.user;

  if (!user) {
    return res.render("index", {
      title: "Bem-vindo à Galeria Web",
      user: null,
      albuns: [],
      categorias: [],
      tags: [],
    });
  }

  try {
    // Busca os álbuns do usuário
    const [albuns] = await db.query(
      `SELECT a.*, (
                SELECT i.Url 
                FROM IMAGENS i
                JOIN IMAGEM_ALBUNS ia ON i.ImagemID = ia.ImagemID
                WHERE ia.AlbumID = a.AlbumID
                ORDER BY i.DataUpload ASC
                LIMIT 1
            ) AS CapaUrl 
            FROM ALBUNS a 
            WHERE a.UsuarioID = ? 
            ORDER BY a.DataCriacao DESC`,
      [user.id]
    );

    const [categorias] = await db.query(
      "SELECT * FROM CATEGORIAS ORDER BY Nome ASC"
    );

    // Busca tags do usuário E tags de itens compartilhados com ele.
    const [tags] = await db.query(
      `SELECT DISTINCT t.TagID, t.Nome
             FROM TAGS t
             JOIN IMAGEM_TAGS it ON t.TagID = it.TagID
             JOIN IMAGENS i ON it.ImagemID = i.ImagemID
             LEFT JOIN IMAGEM_ALBUNS ia ON i.ImagemID = ia.ImagemID
             LEFT JOIN COMPARTILHAMENTOS c_img ON i.ImagemID = c_img.ImagemID AND c_img.UsuarioDestinatarioID = ?
             LEFT JOIN COMPARTILHAMENTOS c_alb ON ia.AlbumID = c_alb.AlbumID AND c_alb.UsuarioDestinatarioID = ?
             WHERE i.UsuarioID = ? OR c_img.CompartilhamentoID IS NOT NULL OR c_alb.CompartilhamentoID IS NOT NULL
             ORDER BY t.Nome ASC`,
      [user.id, user.id, user.id]
    );

    res.render("index", {
      title: "Sua Galeria",
      user: user,
      albuns: albuns || [],
      categorias: categorias || [],
      tags: tags || [],
    });
  } catch (err) {
    console.error("Erro fatal ao carregar o dashboard:", err);
    next(err);
  }
});

/* GET Rota Unificada de Busca e Filtros */
router.get("/search", checkAuth, async function (req, res, next) {
  const { tag_id, category_id, startDate, endDate } = req.query;
  const user = req.session.user;

  if (!tag_id && !category_id && !startDate && !endDate) {
    return res.redirect("/");
  }

  try {
    // 1. REALIZAR A BUSCA PRINCIPAL DE IMAGENS
    let sql = `
            SELECT DISTINCT i.* FROM IMAGENS i
            LEFT JOIN IMAGEM_ALBUNS ia ON i.ImagemID = ia.ImagemID
            LEFT JOIN COMPARTILHAMENTOS c_img ON i.ImagemID = c_img.ImagemID AND c_img.UsuarioDestinatarioID = ?
            LEFT JOIN COMPARTILHAMENTOS c_alb ON ia.AlbumID = c_alb.AlbumID AND c_alb.UsuarioDestinatarioID = ?
        `;
    const joins = [];
    const conditions = [
      "(i.UsuarioID = ? OR c_img.CompartilhamentoID IS NOT NULL OR c_alb.CompartilhamentoID IS NOT NULL)",
    ];
    const params = [user.id, user.id, user.id];

    if (tag_id) {
      joins.push("JOIN IMAGEM_TAGS it ON i.ImagemID = it.ImagemID");
      conditions.push("it.TagID = ?");
      params.push(tag_id);
    }

    if (category_id) {
      conditions.push("i.CategoriaID = ?");
      params.push(category_id);
    }

    if (startDate && endDate) {
      conditions.push("i.DataUpload BETWEEN ? AND ?");
      params.push(startDate, endDate + " 23:59:59");
    }

    if (joins.length > 0) {
      sql += " " + [...new Set(joins)].join(" ");
    }
    sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY i.DataUpload DESC";
    const [imagens] = await db.query(sql, params);

    // 2. BUSCAR NOMES DOS FILTROS ATUAIS PARA EXIBIÇÃO
    let tagName = "";
    if (tag_id) {
      const [tagResult] = await db.query(
        "SELECT Nome FROM TAGS WHERE TagID = ?",
        [tag_id]
      );
      if (tagResult.length > 0) tagName = tagResult[0].Nome;
    }
    let categoryName = "";
    if (category_id) {
      const [catResult] = await db.query(
        "SELECT Nome FROM CATEGORIAS WHERE CategoriaID = ?",
        [category_id]
      );
      if (catResult.length > 0) categoryName = catResult[0].Nome;
    }

    // *** ATUALIZAÇÃO: CARREGAR TODAS AS TAGS E CATEGORIAS PARA OS FILTROS DA PÁGINA ***
    const [todasCategorias] = await db.query(
      "SELECT * FROM CATEGORIAS ORDER BY Nome ASC"
    );
    const [todasTags] = await db.query(
      `SELECT DISTINCT t.TagID, t.Nome
             FROM TAGS t
             JOIN IMAGEM_TAGS it ON t.TagID = it.TagID
             JOIN IMAGENS i ON it.ImagemID = i.ImagemID
             LEFT JOIN IMAGEM_ALBUNS ia ON i.ImagemID = ia.ImagemID
             LEFT JOIN COMPARTILHAMENTOS c_img ON i.ImagemID = c_img.ImagemID AND c_img.UsuarioDestinatarioID = ?
             LEFT JOIN COMPARTILHAMENTOS c_alb ON ia.AlbumID = c_alb.AlbumID AND c_alb.UsuarioDestinatarioID = ?
             WHERE i.UsuarioID = ? OR c_img.CompartilhamentoID IS NOT NULL OR c_alb.CompartilhamentoID IS NOT NULL
             ORDER BY t.Nome ASC`,
      [user.id, user.id, user.id]
    );

    // 3. RENDERIZAR A PÁGINA COM TODOS OS DADOS
    res.render("search-results", {
      title: `Resultados da Busca`,
      user: user,
      imagens: imagens,
      search_tag: tagName,
      search_category: categoryName,
      startDate: startDate,
      endDate: endDate,
      // Passa a lista completa de tags e categorias para a view
      tags: todasTags,
      categorias: todasCategorias,
    });
  } catch (err) {
    console.error("Erro ao realizar a busca:", err);
    next(err);
  }
});

/* GET Rota para a página de configurações */
router.get("/settings", checkAuth, (req, res) => {
  res.render("settings", {
    user: req.session.user,
    tags: [],
    categorias: [],
  });
});

module.exports = router;
