// routes/amizades.js

// Importa o módulo express para criar rotas
const express = require('express');
// Cria um novo roteador do Express
const router = express.Router();
// Importa o módulo de acesso ao banco de dados
const db = require('../db/db'); // Seu pool de conexões com o banco

// Middleware para verificar se o usuário está logado
function checkAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

/* GET Rota para a página de gerenciamento de amigos (buscar, listar, gerenciar solicitações) */
router.get('/', checkAuth, async (req, res, next) => {
    const userId = req.session.user.id;

    try {
        // Buscar solicitações de amizade PENDENTES enviadas PARA o usuário logado
        const [solicitacoesRecebidas] = await db.query(
            `SELECT a.AmizadeID, u.NomeUsuario
             FROM AMIZADES a
             JOIN USUARIOS u ON a.UsuarioSolicitanteID = u.UsuarioID
             WHERE a.UsuarioAceitanteID = ? AND a.Status = 'pendente'`,
            [userId]
        );

        // Buscar amigos (solicitações aceitas) do usuário logado
        const [meusAmigos] = await db.query(
            `SELECT a.AmizadeID, u.UsuarioID, u.NomeUsuario
             FROM AMIZADES a
             JOIN USUARIOS u ON (a.UsuarioSolicitanteID = u.UsuarioID OR a.UsuarioAceitanteID = u.UsuarioID)
             WHERE (a.UsuarioSolicitanteID = ? OR a.UsuarioAceitanteID = ?) AND a.Status = 'aceita'
             AND u.UsuarioID != ?`, // Exclui o próprio usuário da lista de amigos
            [userId, userId, userId]
        );

        // Renderiza a página de amizades com as solicitações e amigos
        res.render('amizades', {
            title: 'Meus Amigos',
            user: req.session.user,
            solicitacoesRecebidas: solicitacoesRecebidas,
            meusAmigos: meusAmigos,
            searchResult: null, // Para exibir resultados de busca de usuários
            error: null,
            success: null
        });

    } catch (err) {
        console.error('Erro ao carregar página de amigos:', err);
        next(err);
    }
});

/* POST Rota para buscar outros usuários */
router.post('/buscar', checkAuth, async (req, res, next) => {
    const userId = req.session.user.id;
    const { termoBusca } = req.body;

    // Se o termo de busca estiver vazio, redireciona de volta
    if (!termoBusca || termoBusca.trim() === '') {
        return res.redirect('/amizades');
    }

    try {
        // Buscar usuários que não são o próprio usuário logado,
        // que não são amigos e para quem não há uma solicitação pendente já enviada ou recebida
        const [usuariosEncontrados] = await db.query(
            `SELECT UsuarioID, NomeUsuario
             FROM USUARIOS
             WHERE NomeUsuario LIKE ? AND UsuarioID != ?
             AND UsuarioID NOT IN (
                 SELECT
                     CASE
                         WHEN UsuarioSolicitanteID = ? THEN UsuarioAceitanteID
                         ELSE UsuarioSolicitanteID
                     END
                 FROM AMIZADES
                 WHERE (UsuarioSolicitanteID = ? OR UsuarioAceitanteID = ?)
                 AND Status IN ('pendente', 'aceita')
             )`,
            [`%${termoBusca}%`, userId, userId, userId, userId]
        );

        // Recarrega os dados da página de amigos para manter o estado
        const [solicitacoesRecebidas] = await db.query(
            `SELECT a.AmizadeID, u.NomeUsuario
             FROM AMIZADES a
             JOIN USUARIOS u ON a.UsuarioSolicitanteID = u.UsuarioID
             WHERE a.UsuarioAceitanteID = ? AND a.Status = 'pendente'`,
            [userId]
        );
        const [meusAmigos] = await db.query(
            `SELECT a.AmizadeID, u.UsuarioID, u.NomeUsuario
             FROM AMIZADES a
             JOIN USUARIOS u ON (a.UsuarioSolicitanteID = u.UsuarioID OR a.UsuarioAceitanteID = u.UsuarioID)
             WHERE (a.UsuarioSolicitanteID = ? OR a.UsuarioAceitanteID = ?) AND a.Status = 'aceita'
             AND u.UsuarioID != ?`,
            [userId, userId, userId]
        );

        // Renderiza a página de amizades com os resultados da busca
        res.render('amizades', {
            title: 'Meus Amigos',
            user: req.session.user,
            solicitacoesRecebidas: solicitacoesRecebidas,
            meusAmigos: meusAmigos,
            searchResult: usuariosEncontrados, // Passa os resultados da busca
            termoBusca: termoBusca, // Mantém o termo de busca no campo
            error: null,
            success: null
        });

    } catch (err) {
        console.error('Erro ao buscar usuários:', err);
        next(err);
    }
});

/* POST Rota para enviar uma solicitação de amizade */
router.post('/solicitar/:destinatarioId', checkAuth, async (req, res, next) => {
    const solicitanteId = req.session.user.id;
    const destinatarioId = req.params.destinatarioId;
    const solicitanteNome = req.session.user.nome;
    const io = req.io;

    // Impede que o usuário envie solicitação para si mesmo
    if (solicitanteId == destinatarioId) {
        return res.status(400).json({ message: 'Você não pode enviar solicitação para si mesmo.' });
    }

    try {
        // Verificar se já existe uma solicitação pendente ou amizade aceita
        const [existing] = await db.query(
            `SELECT * FROM AMIZADES
             WHERE (UsuarioSolicitanteID = ? AND UsuarioAceitanteID = ?)
             OR (UsuarioSolicitanteID = ? AND UsuarioAceitanteID = ?)`,
            [solicitanteId, destinatarioId, destinatarioId, solicitanteId]
        );

        if (existing.length > 0 && existing[0].Status === 'pendente') {
            return res.json({ success: false, message: 'Solicitação de amizade já pendente.' });
        }
        if (existing.length > 0 && existing[0].Status === 'aceita') {
            return res.json({ success: false, message: 'Vocês já são amigos.' });
        }
        
        // Insere a nova solicitação de amizade
        await db.query(
            'INSERT INTO AMIZADES (UsuarioSolicitanteID, UsuarioAceitanteID, Status) VALUES (?, ?, ?)',
            [solicitanteId, destinatarioId, 'pendente']
        );
        
        // EMITIR EVENTO WEBSOCKET para o destinatario
        io.to(destinatarioId.toString()).emit('nova_solicitacao', {
            message: `Você recebeu uma nova solicitação de amizade de ${solicitanteNome}.`,
            remetente: solicitanteNome
        });

        res.json({ success: true, message: 'Solicitação de amizade enviada com sucesso!' });

    } catch (err) {
        console.error('Erro ao enviar solicitação de amizade:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao enviar solicitação.' });
    }
});

/* POST Rota para responder a uma solicitação de amizade (aceitar/recusar) */
router.post('/responder/:amizadeId', checkAuth, async (req, res, next) => {
    const amizadeId = req.params.amizadeId;
    const usuarioAceitanteId = req.session.user.id;
    const { acao } = req.body; // 'aceitar' ou 'recusar'
    const io = req.io;

    // Valida a ação recebida
    if (acao !== 'aceitar' && acao !== 'recusar') {
        return res.status(400).json({ message: 'Ação inválida.' });
    }

    try {
        // Verifica se a solicitação existe e se pertence ao usuário correto e está pendente
        const [amizade] = await db.query(
            `SELECT * FROM AMIZADES WHERE AmizadeID = ? AND UsuarioAceitanteID = ? AND Status = 'pendente'`,
            [amizadeId, usuarioAceitanteId]
        );

        if (amizade.length === 0) {
            return res.status(404).json({ message: 'Solicitação de amizade não encontrada ou já respondida.' });
        }

        let novoStatus = acao === 'aceitar' ? 'aceita' : 'recusada';
        let dataInicioAmizade = acao === 'aceitar' ? new Date() : null;

        // Atualiza o status da amizade no banco
        await db.query(
            'UPDATE AMIZADES SET Status = ?, DataInicioAmizade = ? WHERE AmizadeID = ?',
            [novoStatus, dataInicioAmizade, amizadeId]
        );

        // EMITIR EVENTO WEBSOCKET para o solicitante
        const solicitanteId = amizade[0].UsuarioSolicitanteID;
        const nomeUsuarioLogado = req.session.user.nome;
        
        if (acao === 'aceitar') {
            io.to(solicitanteId.toString()).emit('solicitacao_aceita', {
                message: `${nomeUsuarioLogado} aceitou sua solicitação de amizade!`,
                amigo: nomeUsuarioLogado
            });
        }

        res.json({ success: true, message: `Solicitação ${acao} com sucesso!` });

    } catch (err) {
        console.error('Erro ao responder solicitação de amizade:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao responder solicitação.' });
    }
});

/* POST Rota para remover uma amizade */
router.post('/remover/:amizadeId', checkAuth, async (req, res, next) => {
    const amizadeId = req.params.amizadeId;
    const userId = req.session.user.id; // O usuário que está tentando remover
    const io = req.io;
    const connection = await db.getConnection(); // Adiciona conexão para transação

    try {
        await connection.beginTransaction(); // Inicia transação

        // Verifica se a amizade existe e se um dos usuários é o logado (para evitar remoção indevida)
        const [amizade] = await connection.query(
            `SELECT * FROM AMIZADES WHERE AmizadeID = ? AND (UsuarioSolicitanteID = ? OR UsuarioAceitanteID = ?)`,
            [amizadeId, userId, userId]
        );

        if (amizade.length === 0) {
            await connection.rollback(); // Desfaz transação
            return res.status(404).json({ message: 'Amizade não encontrada ou você não tem permissão.' });
        }
        
        // Descobre o outro usuário envolvido na amizade
        const solicitanteId = amizade[0].UsuarioSolicitanteID;
        const aceitanteId = amizade[0].UsuarioAceitanteID;
        const outroUsuarioId = solicitanteId === userId ? aceitanteId : solicitanteId;
        const nomeUsuarioLogado = req.session.user.nome;

        // --- NOVO PASSO: Remover compartilhamentos relacionados a esta amizade ---
        // Remove compartilhamentos onde o usuário logado é o remetente E o outro usuário é o destinatário
        await connection.query(
            `DELETE FROM COMPARTILHAMENTOS
             WHERE (UsuarioRemetenteID = ? AND UsuarioDestinatarioID = ?)
             OR (UsuarioRemetenteID = ? AND UsuarioDestinatarioID = ?)`,
            [userId, outroUsuarioId, outroUsuarioId, userId]
        );

        // Remove a própria amizade
        await connection.query('DELETE FROM AMIZADES WHERE AmizadeID = ?', [amizadeId]);

        await connection.commit(); // Confirma transação

        // EMITIR EVENTO WEBSOCKET para o outro usuário
        io.to(outroUsuarioId.toString()).emit('amizade_removida', {
            message: `${nomeUsuarioLogado} desfez a amizade com você.`
        });

        res.json({ success: true, message: 'Amizade removida com sucesso.' });

    } catch (err) {
        await connection.rollback(); // Desfaz transação em caso de erro
        console.error('Erro ao remover amizade:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao remover amizade.' });
    } finally {
        if (connection) connection.release(); // Sempre libera a conexão
    }
});

// Exporta o roteador para ser usado em outros módulos
module.exports = router;