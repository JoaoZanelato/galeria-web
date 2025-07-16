// Importa o módulo express para criar rotas
var express = require("express");
// Cria um novo roteador do Express
var router = express.Router();
// Importa o módulo de acesso ao banco de dados
const db = require("../db/db");

// Middleware para verificar se o usuário está logado
function checkAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/auth/login");
  }
  next();
}

/* GET home page (dashboard).
   Exibe a página inicial da galeria do usuário logado.
   Se não estiver logado, mostra a tela de boas-vindas.
*/
router.get("/", async function (req, res, next) {
  const user = req.session.user;

  if (!user) {
    // Usuário não logado: renderiza página inicial genérica
    return res.render("index", {
      title: "Bem-vindo à Galeria Web",
      user: null,
      albuns: [],
      categorias: [],
      tags: [],
    });
  }

  try {
    // Busca os álbuns do usuário, incluindo a imagem de capa de cada álbum
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

    // Busca todas as categorias cadastradas
    const [categorias] = await db.query(
      "SELECT * FROM CATEGORIAS ORDER BY Nome ASC"
    );

    // Busca todas as tags do usuário e de itens compartilhados com ele
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

    // Renderiza o dashboard do usuário com álbuns, categorias e tags
    res.render("index", {
      title: "Sua Galeria",
      user: user,
      albuns: albuns || [],
      categorias: categorias || [],
      tags: tags || [],
    });
  } catch (err) {
    // Em caso de erro, registra no console e passa para o middleware de erro
    console.error("Erro fatal ao carregar o dashboard:", err);
    next(err);
  }
});

/* GET Rota Unificada de Busca e Filtros
   Permite buscar imagens por tag, categoria e intervalo de datas.
   Exibe os resultados filtrados na página de busca.
*/
router.get("/search", checkAuth, async function (req, res, next) {
  // Extrai filtros da query string
  const { tag_id, category_id, startDate, endDate } = req.query;
  const user = req.session.user;

  // Se não houver nenhum filtro, redireciona para a home
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

    // Adiciona filtro por tag se informado
    if (tag_id) {
      joins.push("JOIN IMAGEM_TAGS it ON i.ImagemID = it.ImagemID");
      conditions.push("it.TagID = ?");
      params.push(tag_id);
    }

    // Adiciona filtro por categoria se informado
    if (category_id) {
      conditions.push("i.CategoriaID = ?");
      params.push(category_id);
    }

    // Adiciona filtro por intervalo de datas se informado
    if (startDate && endDate) {
      conditions.push("i.DataUpload BETWEEN ? AND ?");
      params.push(startDate, endDate + " 23:59:59");
    }

    // Monta a query final com os joins e condições
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

    // 3. CARREGAR TODAS AS TAGS E CATEGORIAS PARA OS FILTROS DA PÁGINA
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

    // 4. RENDERIZAR A PÁGINA COM TODOS OS DADOS
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
    // Em caso de erro, registra no console e passa para o middleware de erro
    console.error("Erro ao realizar a busca:", err);
    next(err);
  }
});

/* GET Rota para a página de configurações
   Renderiza a página de configurações do usuário.
*/
router.get("/settings", checkAuth, (req, res) => {
  res.render("settings", {
    user: req.session.user,
    tags: [],
    categorias: [],
  });
});

// Exporta o roteador para ser usado em outros arquivos do projeto
module.exports = router;