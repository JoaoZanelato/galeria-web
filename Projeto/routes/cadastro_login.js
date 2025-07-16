// Importa o módulo express para criar rotas
const express = require('express');
// Cria um novo roteador do Express
const router = express.Router();
// Importa o módulo bcryptjs para criptografar senhas
const bcrypt = require('bcryptjs');
// Importa o pool de conexão com o banco de dados
const db = require('../db/db');
// Importa o Cloudinary para manipulação de imagens
const {cloudinary} = require('../config/cloudinary')

// --- Função middleware para verificar se o usuário está autenticado ---
function checkAuth(req, res, next) {
  if(!req.session.user) {
    // Se não estiver logado, redireciona para login
    return res.redirect('/auth/login')
  }
  next();
}

// --- ROTAS GET PARA RENDERIZAR AS PÁGINAS ---

/* Rota GET para a página de cadastro.
   Renderiza o arquivo de visualização 'cadastro.ejs'.
*/
router.get('/cadastro', function(req, res, next) {
  // Renderiza a página de cadastro (views/cadastro.ejs)
  res.render('cadastro', { error: null, user: req.session.user || null });
});

/* Rota GET para a página de login.
   Renderiza o arquivo de visualização 'login.ejs'.
*/
router.get('/login', function(req, res, next) {
  // Renderiza a página de login (views/login.ejs)
  res.render('login', { error: null, user: req.session.user || null });
});

// --- ROTAS POST PARA PROCESSAR OS FORMULÁRIOS ---

/* Rota POST para registrar um novo usuário.
   Processa o formulário de cadastro.
*/
router.post('/cadastro', async (req, res, next) => {
  // Extrai os dados do formulário
  const { nomeUsuario, email, senha, confirmar_senha } = req.body;

  // Validação dos campos obrigatórios
  if (!nomeUsuario || !email || !senha || !confirmar_senha) {
    return res.render('cadastro', { error: 'Todos os campos são obrigatórios!', user: req.session.user || null });
  }

  // Verifica se as senhas coincidem
  if (senha !== confirmar_senha) {
    return res.render('cadastro', { error: 'As senhas não coincidem!', user: req.session.user || null });
  }

  try {
    // Verifica se o email ou nome de usuário já existem
    const [existingUsers] = await db.query(
      'SELECT Email, NomeUsuario FROM USUARIOS WHERE Email = ? OR NomeUsuario = ?',
      [email, nomeUsuario]
    );

    if (existingUsers.length > 0) {
      return res.render('cadastro', { error: 'Email ou nome de usuário já cadastrado.', user: req.session.user || null });
    }

    // Criptografa a senha antes de salvar
    const senhaHash = await bcrypt.hash(senha, 10);

    // Insere o novo usuário no banco de dados
    await db.query(
      'INSERT INTO USUARIOS (NomeUsuario, Email, SenhaHash) VALUES (?, ?, ?)',
      [nomeUsuario, email, senhaHash]
    );

    // Redireciona para a página de login após cadastro
    res.redirect('/auth/login');

  } catch (err) {
    console.error('Erro ao cadastrar usuário:', err);
    next(err);
  }
});

/* Rota POST para autenticar um usuário (login).
   Processa o formulário de login.
*/
router.post('/login', async (req, res, next) => {
  // Extrai email e senha do formulário
  const { email, senha } = req.body;

  // Validação dos campos obrigatórios
  if (!email || !senha) {
    return res.render('login', { error: 'Email e senha são obrigatórios!', user: null });
  }

  try {
    // Busca o usuário no banco de dados pelo email
    const [rows] = await db.query(
      'SELECT * FROM USUARIOS WHERE Email = ?',
      [email]
    );

    // Se não encontrar usuário, retorna erro genérico
    if (rows.length === 0) {
      return res.render('login', { error: 'Credenciais inválidas.', user: null });
    }

    const usuario = rows[0];

    // Compara a senha enviada com o hash do banco
    const senhaCorreta = await bcrypt.compare(senha, usuario.SenhaHash);

    if (!senhaCorreta) {
      // Se a senha estiver incorreta, retorna erro genérico
      return res.render('login', { error: 'Credenciais inválidas.', user: null });
    }

    // --- SUCESSO NO LOGIN ---
    // Salva as informações do usuário na sessão (sem senha/hash)
    req.session.user = {
      id: usuario.UsuarioID,
      nome: usuario.NomeUsuario,
      email: usuario.Email
    };

    // DEBUG: Exibe a sessão no console
    console.log('Sessão logo após o login:', req.session);

    // Força o salvamento da sessão antes de redirecionar
    req.session.save((err) => {
      if (err) {
        return next(err);
      }
      // Redireciona para a página principal (dashboard)
      res.redirect('/');
    });

  } catch (err) {
    console.error('Erro ao fazer login:', err);
    next(err);
  }
});

/* Rota GET para fazer logout do usuário.
   Remove a sessão e redireciona para a página inicial.
*/
router.get('/logout', (req, res, next) => {
  // O método destroy() remove a sessão.
  req.session.destroy((err) => {
    if (err) {
      // Se houver erro ao destruir a sessão, encaminha para o error handler.
      return next(err);
    }
    // Após destruir a sessão, redireciona para a página inicial.
    res.redirect('/');
  });
});

/* Rota POST para Apagar a Conta do Usuário.
   Remove o usuário e suas imagens do banco e do Cloudinary.
*/
router.post('/delete', checkAuth, async (req, res, next) =>{
  const usuarioId = req.session.user.id;
  const connection = await db.getConnection();

  try{
    await connection.beginTransaction();

    // Busca todas as imagens do usuário
    const [imagens] = await connection.query('SELECT NomeArquivo FROM IMAGENS WHERE UsuarioID = ?', [usuarioId]);

    // Remove as imagens do Cloudinary se houver
    if (imagens.length > 0) {
      const publicIds = imagens.map(img => img.NomeArquivo);

      console.log(`A apagar ${publicIds.length} imagens da Cloudinary...`)
      await cloudinary.api.delete_resources(publicIds);
    }
    // Remove o usuário do banco de dados
    await connection.query('DELETE FROM USUARIOS WHERE UsuarioID = ?', [usuarioId])
    
    await connection.commit();

    // Destroi a sessão e redireciona para a página inicial
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

// Exporta o roteador para ser usado em outros arquivos do projeto
module.exports = router;