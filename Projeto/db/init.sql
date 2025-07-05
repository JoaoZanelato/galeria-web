
-- init.sql

-- Opcional: Desativar a verificação de chaves estrangeiras temporariamente
-- Isso pode ser útil ao criar tabelas com dependências circulares, mas use com cautela.
-- SET FOREIGN_KEY_CHECKS = 0;


-- 1. Tabela: USUARIOS
CREATE TABLE USUARIOS (
    UsuarioID        INT PRIMARY KEY AUTO_INCREMENT,
    NomeUsuario      VARCHAR(50) UNIQUE NOT NULL,
    Email            VARCHAR(100) UNIQUE NOT NULL,
    SenhaHash        VARCHAR(255) NOT NULL,
    DataRegistro     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UltimoLogin      DATETIME
);

-- Índices para melhorar a performance de busca
CREATE INDEX idx_usuarios_nomeusuario ON USUARIOS (NomeUsuario);
CREATE INDEX idx_usuarios_email ON USUARIOS (Email);


-- 2. Tabela: AMIZADES
CREATE TABLE AMIZADES (
    AmizadeID           INT PRIMARY KEY AUTO_INCREMENT,
    UsuarioSolicitanteID INT NOT NULL,
    UsuarioAceitanteID   INT NOT NULL,
    Status               VARCHAR(20) NOT NULL, -- Ex: 'pendente', 'aceita', 'recusada'
    DataInicioAmizade    DATETIME,
    FOREIGN KEY (UsuarioSolicitanteID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    FOREIGN KEY (UsuarioAceitanteID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    UNIQUE (UsuarioSolicitanteID, UsuarioAceitanteID), -- Garante que um par de amizade seja único
    CONSTRAINT chk_amizade_self_ref CHECK (UsuarioSolicitanteID <> UsuarioAceitanteID) -- Um usuário não pode ser amigo de si mesmo
);


-- 3. Tabela: TAGS (Tags pertencem a um Usuário específico)
CREATE TABLE TAGS (
    TagID       INT PRIMARY KEY AUTO_INCREMENT,
    Nome        VARCHAR(50) NOT NULL,
    UsuarioID   INT NOT NULL, -- Criador/Dono da tag
    FOREIGN KEY (UsuarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    UNIQUE (Nome, UsuarioID) -- Garante que um usuário não tenha duas tags com o mesmo nome
);


-- 4. Tabela: CATEGORIAS (Categorias pertencem a um Usuário específico)
CREATE TABLE CATEGORIAS (
    CategoriaID INT PRIMARY KEY AUTO_INCREMENT,
    Nome        VARCHAR(100) NOT NULL,
    UsuarioID   INT NOT NULL, -- Criador da categoria
    FOREIGN KEY (UsuarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    UNIQUE (Nome, UsuarioID) -- Garante que um usuário não tenha duas categorias com o mesmo nome
);


-- 5. Tabela: IMAGENS
CREATE TABLE IMAGENS (
    ImagemID          INT PRIMARY KEY AUTO_INCREMENT,
    NomeArquivo       VARCHAR(255) NOT NULL,
    Url               VARCHAR(500) UNIQUE NOT NULL, -- URL para o armazenamento da imagem
    DataUpload        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    DataModificacao   DATETIME,
    UsuarioID         INT NOT NULL, -- Criador/Dono da imagem
    FOREIGN KEY (UsuarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE
);


-- 6. Tabela: ALBUNS
CREATE TABLE ALBUNS (
    AlbumID           INT PRIMARY KEY AUTO_INCREMENT,
    UsuarioID         INT NOT NULL, -- Criador/Dono do álbum
    Nome              VARCHAR(100) NOT NULL,
    Descricao         VARCHAR(500),
    DataCriacao       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    DataModificacao   DATETIME,
    FOREIGN KEY (UsuarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE
);


-- 7. Tabela: IMAGEM_TAGS (Tabela de junção N:N para Imagens e Tags)
CREATE TABLE IMAGEM_TAGS (
    ImagemID INT NOT NULL,
    TagID    INT NOT NULL,
    PRIMARY KEY (ImagemID, TagID),
    FOREIGN KEY (ImagemID) REFERENCES IMAGENS(ImagemID) ON DELETE CASCADE,
    FOREIGN KEY (TagID) REFERENCES TAGS(TagID) ON DELETE CASCADE
);


-- 8. Tabela: IMAGEM_ALBUNS (Tabela de junção N:N para Imagens e Álbuns)
CREATE TABLE IMAGEM_ALBUNS (
    ImagemID      INT NOT NULL,
    AlbumID       INT NOT NULL,
    -- Opcional: Para definir a ordem das imagens dentro de um álbum
    -- OrdemNoAlbum INT,
    PRIMARY KEY (ImagemID, AlbumID),
    FOREIGN KEY (ImagemID) REFERENCES IMAGENS(ImagemID) ON DELETE CASCADE,
    FOREIGN KEY (AlbumID) REFERENCES ALBUNS(AlbumID) ON DELETE CASCADE
);


-- 9. Tabela: TAG_USUARIOS (Tabela de junção N:N para Tags e Usuários, conforme seu DER)
-- NOTA: Se TAGS já tem UsuarioID, esta tabela é redundante para propriedade da tag.
-- Ela seria útil se TAGS fossem globais e esta tabela mapeasse quais tags globais um usuário *usa*.
-- Mantida conforme seu DER.
CREATE TABLE TAG_USUARIOS (
    TagID     INT NOT NULL,
    UsuarioID INT NOT NULL,
    PRIMARY KEY (TagID, UsuarioID),
    FOREIGN KEY (TagID) REFERENCES TAGS(TagID) ON DELETE CASCADE,
    FOREIGN KEY (UsuarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE
);


-- 10. Tabela: IMAGEM_USUARIOS (Tabela de junção N:N para Imagens e Usuários, conforme seu DER)
-- NOTA: Se COMPARTILHAMENTOS já lida com o compartilhamento de imagens, esta tabela pode ser redundante.
-- Mantida conforme seu DER.
CREATE TABLE IMAGEM_USUARIOS (
    ImagemID  INT NOT NULL,
    UsuarioID INT NOT NULL,
    PRIMARY KEY (ImagemID, UsuarioID),
    FOREIGN KEY (ImagemID) REFERENCES IMAGENS(ImagemID) ON DELETE CASCADE,
    FOREIGN KEY (UsuarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE
);


-- 11. Tabela: COMPARTILHAMENTOS (Nova entidade para registro de compartilhamentos)
CREATE TABLE COMPARTILHAMENTOS (
    CompartilhamentoID    INT PRIMARY KEY AUTO_INCREMENT,
    UsuarioRemetenteID    INT NOT NULL,
    UsuarioDestinatarioID INT NOT NULL,
    ImagemID              INT, -- Pode ser NULL
    AlbumID               INT, -- Pode ser NULL
    DataCompartilhamento  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Permissao             VARCHAR(50), -- Ex: 'visualizar', 'baixar', 'editar'
    FOREIGN KEY (UsuarioRemetenteID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    FOREIGN KEY (UsuarioDestinatarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    FOREIGN KEY (ImagemID) REFERENCES IMAGENS(ImagemID) ON DELETE SET NULL,
    FOREIGN KEY (AlbumID) REFERENCES ALBUNS(AlbumID) ON DELETE SET NULL,
    -- Restrição para garantir que apenas um item (imagem OU álbum) seja compartilhado por registro
    CONSTRAINT chk_compartilhamento_item_type CHECK (
        (ImagemID IS NOT NULL AND AlbumID IS NULL) OR
        (ImagemID IS NULL AND AlbumID IS NOT NULL)
    ),
    -- Garante que um remetente não compartilhe o MESMO item (imagem ou álbum) com o MESMO destinatário múltiplas vezes
    UNIQUE (UsuarioRemetenteID, UsuarioDestinatarioID, ImagemID, AlbumID)
);

-- Opcional: Reativar a verificação de chaves estrangeiras se desativada
-- SET FOREIGN_KEY_CHECKS = 1;