# Galeria Web

Galeria Web é uma aplicação full-stack robusta para armazenamento, organização e compartilhamento de fotos. Construída com Node.js e Express, a plataforma permite que os usuários gerenciem suas memórias digitais em álbuns, adicionem tags, e compartilhem com amigos de forma segura, incluindo funcionalidades sociais e interações em tempo real.

## ✨ Funcionalidades

* **Autenticação de Usuário**: Sistema seguro de cadastro e login com criptografia de senhas (bcrypt).
* **Gerenciamento de Mídia**: Faça upload de imagens, que são armazenadas na nuvem (Cloudinary) para maior escalabilidade.
* **Organização**:
    * Crie, edite e delete **álbuns** para agrupar suas fotos.
    * Adicione **tags** personalizadas às imagens para facilitar a busca.
    * Associe imagens a **categorias** pré-definidas.
* **Sistema Social**:
    * Adicione amigos através de um sistema de solicitação e aceite.
    * Busque por outros usuários na plataforma.
* **Compartilhamento Avançado**:
    * Compartilhe álbuns ou imagens individuais com seus amigos.
    * Defina permissões de acesso: apenas visualização (`compartilhado`) ou edição (`editavel`).
* **Interatividade em Tempo Real**: Receba notificações instantâneas (via WebSockets com Socket.io) para novas solicitações de amizade e compartilhamentos.
* **Busca e Filtro**: Encontre imagens por tags, categorias ou data de upload.

## 🚀 Tecnologias Utilizadas

* **Backend**: Node.js, Express.js
* **Frontend**: EJS (Embedded JavaScript templates), CSS3, JavaScript
* **Banco de Dados**: MySQL
* **Armazenamento de Imagens**: Cloudinary
* **Comunicação em Tempo Real**: Socket.io
* **Segurança**: `bcryptjs` para hashing de senhas, `express-session` para gerenciamento de sessões.
* **Desenvolvimento**: `nodemon` para live-reloading do servidor.

## ⚙️ Rotas da API

Aqui está uma lista detalhada de todas as rotas da aplicação, agrupadas por funcionalidade.

---

### 🏠 Rotas Principais (`/`)

| Verbo  | Rota      | Descrição                                                                      |
| :----- | :-------- | :----------------------------------------------------------------------------- |
| `GET`  | `/`       | Exibe a página principal (landing page ou dashboard do usuário se estiver logado). |
| `GET`  | `/search` | Filtra e exibe imagens baseadas em tags, categorias ou datas.                  |
| `GET`  | `/settings` | Exibe a página de configurações da conta do usuário.                           |

### 👤 Autenticação e Usuários (`/auth`)

| Verbo  | Rota             | Descrição                                                                    |
| :----- | :--------------- | :--------------------------------------------------------------------------- |
| `GET`  | `/auth/cadastro` | Renderiza a página de cadastro de novo usuário.                                |
| `POST` | `/auth/cadastro` | Processa o formulário de registro de um novo usuário.                          |
| `GET`  | `/auth/login`    | Renderiza a página de login.                                                     |
| `POST` | `/auth/login`    | Processa o formulário de login e cria uma sessão para o usuário.             |
| `GET`  | `/auth/logout`   | Destrói a sessão do usuário (faz o logout).                                 |
| `POST` | `/auth/delete`   | **(Requer autenticação)** Deleta a conta do usuário e todas as suas imagens do Cloudinary. |

### 🖼️ Galeria e Imagens (`/galeria`)

| Verbo  | Rota                         | Descrição                                                                                    |
| :----- | :--------------------------- | :------------------------------------------------------------------------------------------- |
| `GET`  | `/galeria/upload`            | **(Requer autenticação)** Exibe a página de upload de imagens.                               |
| `POST` | `/galeria/upload`            | **(Requer autenticação)** Processa o upload de uma nova imagem, associando-a a um álbum e tags. |
| `GET`  | `/galeria/imagem/:id/edit`   | **(Requer autenticação)** Exibe o formulário para editar os detalhes de uma imagem.          |
| `POST` | `/galeria/imagem/:id/edit`   | **(Requer autenticação)** Atualiza as informações (descrição, tags, categoria) de uma imagem.  |
| `POST` | `/galeria/imagem/:id/delete` | **(Requer autenticação)** Apaga uma imagem do banco de dados e do Cloudinary.                |
| `GET`  | `/galeria/imagem/:id/share`  | **(Requer autenticação)** Mostra a página para gerenciar o compartilhamento de uma imagem individual. |
| `POST` | `/galeria/imagem/:id/share`  | **(Requer autenticação)** Salva as configurações de compartilhamento da imagem.              |

### 📂 Álbuns (`/albuns`)

| Verbo  | Rota                       | Descrição                                                                                                |
| :----- | :------------------------- | :------------------------------------------------------------------------------------------------------- |
| `GET`  | `/albuns/:id`              | **(Requer autenticação)** Exibe os detalhes e as imagens de um álbum específico, se o usuário tiver permissão. |
| `GET`  | `/albuns/:id/edit`         | **(Requer autenticação)** Exibe o formulário para editar o nome e a descrição de um álbum.           |
| `POST` | `/albuns/:id/edit`         | **(Requer autenticação)** Atualiza as informações de um álbum.                                      |
| `POST` | `/albuns/:id/delete`       | **(Requer autenticação)** Deleta um álbum e as imagens contidas nele (se não pertencerem a outros álbuns). |
| `GET`  | `/albuns/:id/compartilhar` | **(Requer autenticação)** Mostra a página para gerenciar o compartilhamento de um álbum.               |
| `POST` | `/albuns/:id/share`        | **(Requer autenticação)** Salva as configurações de compartilhamento (adiciona/remove amigos e define permissões). |

### 🤝 Amizades (`/amizades`)

| Verbo  | Rota                      | Descrição                                                                          |
| :----- | :------------------------ | :--------------------------------------------------------------------------------- |
| `GET`  | `/amizades`               | **(Requer autenticação)** Página principal de amizades: lista amigos e solicitações pendentes. |
| `POST` | `/amizades/buscar`        | **(Requer autenticação)** Busca por outros usuários na plataforma pelo nome.             |
| `POST` | `/amizades/solicitar/:id` | **(Requer autenticação)** Envia uma solicitação de amizade para outro usuário.             |
| `POST` | `/amizades/responder/:id` | **(Requer autenticação)** Aceita ou recusa uma solicitação de amizade pendente.         |
| `POST` | `/amizades/remover/:id`   | **(Requer autenticação)** Remove uma amizade existente.                                 |

### 🔗 Itens Compartilhados (`/compartilhados`)

| Verbo  | Rota              | Descrição                                                                    |
| :----- | :---------------- | :--------------------------------------------------------------------------- |
| `GET`  | `/compartilhados` | **(Requer autenticação)** Exibe todos os álbuns e imagens que foram compartilhados com o usuário logado. |

---

## 🚀 Como Executar

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/joaozanelato/galeria-web.git](https://github.com/joaozanelato/galeria-web.git)
    cd galeria-web/Projeto
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    Crie um arquivo `.env` na pasta `Projeto/` com base nos arquivos de configuração (`db/db.js` e `config/cloudinary.js`). Ele deve conter:
    ```env
    # Configurações do Banco de Dados (Aiven/MySQL)
    DB_HOST=...
    DB_USER=...
    DB_PASSWORD=...
    DB_NAME=...
    DB_PORT=...
    DB_CA="-----BEGIN CERTIFICATE-----\n..."

    # Configurações do Cloudinary
    CLOUDINARY_CLOUD_NAME=...
    CLOUDINARY_KEY=...
    CLOUDINARY_SECRET=...

    # Segredo da Sessão Express
    SESSION_SECRET=seu_segredo_super_secreto_aqui
    ```

4.  **Inicie o servidor:**
    ```bash
    npm start
    ```

5.  Acesse `http://localhost:3000` no seu navegador.

