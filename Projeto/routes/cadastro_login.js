const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs'); // Para criptografar as senhas
const db = require('../db/db'); // Nosso pool de conexão com o banco de dados
const {cloudinary} = require('../config/cloudinary')

// --- ROTAS GET PARA RENDERIZAR AS PÁGINAS ---

function checkAuth(req, res, next) {
  if(!req.session.user) {
    return res.redirect('/auth/login')
  }
  next();
}

/* * Rota GET para a página de cadastro.
 * Simplesmente renderiza o arquivo de visualização 'cadastro.ejs'.
 */
router.get('/cadastro', function(req, res, next) {
  // Renderiza a página de cadastro (views/cadastro.ejs)
  res.render('cadastro', { error: null, user: req.session.user || null });
});

/* * Rota GET para a página de login.
 * Simplesmente renderiza o arquivo de visualização 'login.ejs'.
 */
router.get('/login', function(req, res, next) {
  // Renderiza a página de login (views/login.ejs)
  res.render('login', { error: null, user: req.session.user || null });
});


// --- ROTAS POST PARA PROCESSAR OS FORMULÁRIOS ---

/**
 * Rota POST para registrar um novo usuário.
 * Acessada quando o formulário de cadastro é enviado.
 */
router.post('/cadastro', async (req, res, next) => {
  // 1. Extrai os dados do corpo da requisição (do formulário)
  const { nomeUsuario, email, senha, confirmar_senha } = req.body;

  // 2. Validação dos campos
  if (!nomeUsuario || !email || !senha || !confirmar_senha) {
    return res.render('cadastro', { error: 'Todos os campos são obrigatórios!', user: req.session.user || null });
  }

  if (senha !== confirmar_senha) {
    return res.render('cadastro', { error: 'As senhas não coincidem!', user: req.session.user || null });
  }

  try {
    // 3. Verifica se o email ou o nome de usuário já existem no banco
    const [existingUsers] = await db.query(
      'SELECT Email, NomeUsuario FROM USUARIOS WHERE Email = ? OR NomeUsuario = ?',
      [email, nomeUsuario]
    );

    if (existingUsers.length > 0) {
      return res.render('cadastro', { error: 'Email ou nome de usuário já cadastrado.', user: req.session.user || null });
    }

    // 4. Criptografa a senha antes de salvar no banco
    const senhaHash = await bcrypt.hash(senha, 10);

    // 5. Insere o novo usuário no banco de dados
    await db.query(
      'INSERT INTO USUARIOS (NomeUsuario, Email, SenhaHash) VALUES (?, ?, ?)',
      [nomeUsuario, email, senhaHash]
    );

    // 6. Redireciona para a página de login após o sucesso
    res.redirect('/auth/login');

  } catch (err) {
    console.error('Erro ao cadastrar usuário:', err);
    next(err);
  }
});


/**
 * Rota POST para autenticar um usuário (fazer o login).
 * Acessada quando o formulário de login é enviado.
 */
router.post('/login', async (req, res, next) => {
  // 1. Extrai email e senha do formulário
  const { email, senha } = req.body;

  // 2. Validação simples
  if (!email || !senha) {
    return res.render('login', { error: 'Email e senha são obrigatórios!', user: null });
  }

  try {
    // 3. Busca o usuário no banco de dados pelo email
    const [rows] = await db.query(
      'SELECT * FROM USUARIOS WHERE Email = ?',
      [email]
    );

    // 4. Se o usuário não for encontrado, retorna um erro genérico
    if (rows.length === 0) {
      return res.render('login', { error: 'Credenciais inválidas.', user: null });
    }

    const usuario = rows[0];

    // 5. Compara a senha enviada com a senha criptografada (hash) do banco
    const senhaCorreta = await bcrypt.compare(senha, usuario.SenhaHash);

    if (!senhaCorreta) {
      // Se a senha estiver incorreta, retorna o mesmo erro genérico por segurança
      return res.render('login', { error: 'Credenciais inválidas.', user: null });
    }

    // --- SUCESSO NO LOGIN ---
    // 6. Salva as informações do usuário na sessão.
    // NUNCA salve a senha ou o hash da senha na sessão.
    req.session.user = {
      id: usuario.UsuarioID,
      nome: usuario.NomeUsuario,
      email: usuario.Email
    };

    // DEBUG: Linha para verificar o conteúdo da sessão antes de redirecionar
    console.log('Sessão logo após o login:', req.session);

    // 7. Força o salvamento da sessão antes de redirecionar para evitar problemas de timing
    req.session.save((err) => {
      if (err) {
        return next(err);
      }
      // 8. Redireciona para a página principal, que agora mostrará o dashboard
      res.redirect('/');
    });

  } catch (err) {
    console.error('Erro ao fazer login:', err);
    next(err);
  }
});

/* Rota GET para fazer logout do usuário. */
router.get('/logout', (req, res, next) => {
  // O método destroy() remove a sessão.
  req.session.destroy((err) => {
    if (err) {
      // Se houver um erro ao destruir a sessão, encaminhe para o error handler.
      return next(err);
    }
    // Após destruir a sessão, redireciona o usuário para a página inicial.
    res.redirect('/');
  });
});

/* Rota POST para Apagar a Conta */
router.post('/delete', checkAuth, async (req, res, next) =>{
  const usuarioId = req.session.user.id;
  const connection = await db.getConnection();

  try{
    await connection.beginTransaction();

    const [imagens] = await connection.query('SELECT NomeArquivo FROM IMAGENS WHERE UsuarioID = ?', [usuarioId]);

    if (imagens.length > 0) {
      const publicIds = imagens.map(img => img.NomeArquivo);

      console.log(`A apagar ${publicIds.length} imagens da Cloudinary...`)
      await cloudinary.api.delete_resources(publicIds);
    }
    await connection.query('DELETE FROM USUARIOS WHERE UsuarioID = ?', [usuarioId])
    
    await connection.commit();

    req.session.destroy((err) => {
      if(err) {return next(err)}
      res.redirect('/');
    })
  } catch (err) {
    await connection.rollback();
    console.log("ERRO ao apagar a conta:", err)
    next(err)
  } finally {
    if(connection) connection.release();
  }
})


module.exports = router;