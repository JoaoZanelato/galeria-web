var express = require('express');
var router = express.Router();
const db = require('../db/db'); // Importe a conexão com o banco

// Middleware para verificar se o usuário está logado
function checkAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

/* GET home page (dashboard). */
router.get('/', async function(req, res, next) {
    const user = req.session.user;

    // Se não houver usuário logado, renderiza a landing page.
    if (!user) {
        return res.render('index', {
            title: 'Bem-vindo à Galeria Web',
            user: null,
            albuns: [],
            categorias: [],
            tags: []
        });
    }

    // Se houver usuário, busca os dados para o dashboard.
    try {
        const [albuns] = await db.query('SELECT * FROM ALBUNS WHERE UsuarioID = ? ORDER BY DataCriacao DESC', [user.id]);
        const [categorias] = await db.query('SELECT * FROM CATEGORIAS ORDER BY Nome ASC');
        const [tags] = await db.query('SELECT * FROM TAGS WHERE UsuarioID = ? ORDER BY Nome ASC', [user.id]);

        // A consulta e a variável para 'albunsCompartilhados' foram removidas.

        // Renderiza a página do dashboard apenas com os dados necessários.
        res.render('index', {
            title: 'Sua Galeria',
            user: user,
            albuns: albuns || [],
            categorias: categorias || [],
            tags: tags || []
        });
    } catch (err) {
        console.error("Erro fatal ao carregar o dashboard:", err);
        next(err); // Envia o erro para o handler de erros do Express
    }
});

/* GET Rota Unificada de Busca e Filtros */
router.get('/search', checkAuth, async function(req, res, next) {
    const { tag_id, category_id, startDate, endDate } = req.query;
    const user = req.session.user;

    if (!tag_id && !category_id && !startDate && !endDate) {
        return res.redirect('/');
    }

    try {
        let sql = 'SELECT DISTINCT i.* FROM IMAGENS i';
        const joins = [];
        const conditions = ['i.UsuarioID = ?'];
        const params = [user.id];

        if (tag_id) {
            joins.push('JOIN IMAGEM_TAGS it ON i.ImagemID = it.ImagemID');
            conditions.push('it.TagID = ?');
            params.push(tag_id);
        }

        if (category_id) {
            conditions.push('i.CategoriaID = ?');
            params.push(category_id);
        }

        if (startDate && endDate) {
            conditions.push('i.DataUpload BETWEEN ? AND ?');
            params.push(startDate);
            params.push(endDate + ' 23:59:59');
        }

        if (joins.length > 0) {
            sql += ' ' + [...new Set(joins)].join(' ');
        }

        sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY i.DataUpload DESC';

        const [imagens] = await db.query(sql, params);

        let tagName = '';
        if (tag_id) {
            const [tagResult] = await db.query('SELECT Nome FROM TAGS WHERE TagID = ?', [tag_id]);
            if (tagResult.length > 0) tagName = tagResult[0].Nome;
        }

        let categoryName = '';
        if (category_id) {
            const [catResult] = await db.query('SELECT Nome FROM CATEGORIAS WHERE CategoriaID = ?', [category_id]);
            if (catResult.length > 0) categoryName = catResult[0].Nome;
        }

        res.render('search-results', {
            title: `Resultados da Busca`,
            user: user,
            imagens: imagens,
            search_tag: tagName,
            search_category: categoryName,
            startDate: startDate,
            endDate: endDate,
            tags: [],
            categorias: []
        });

    } catch (err) {
        console.error("Erro ao realizar a busca:", err);
        next(err);
    }
});

/* GET Rota para a página de configurações */
router.get('/settings', checkAuth, (req, res) => {
    res.render('settings', {
        user: req.session.user,
        tags: [],
        categorias: []
    });
});

module.exports = router;