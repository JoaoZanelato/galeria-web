-- =====================================================================
-- SCRIPT SQL NORMALIZADO (3FN) PARA O PROJETO GALERIA WEB
-- =====================================================================
--
-- ANÁLISE DE NORMALIZAÇÃO:
-- 1FN: Todas as colunas são atômicas. (OK)
-- 2FN: Não há dependências parciais em chaves primárias compostas. As
--      tabelas de junção (IMAGEM_TAGS, IMAGEM_ALBUNS) não possuem
--      colunas adicionais, evitando essa questão. (OK)
-- 3FN: Não há dependências transitivas. Todos os atributos não-chave
--      dependem diretamente da chave primária. As tabelas redundantes
--      (TAG_USUARIOS e IMAGEM_USUARIOS) foram removidas para
--      cumprir plenamente com a 3FN. (OK)
--
-- =====================================================================

-- A ordem de exclusão (DROP) é importante para evitar erros de chave estrangeira.
DROP TABLE IF EXISTS COMPARTILHAMENTOS;
DROP TABLE IF EXISTS IMAGEM_ALBUNS;
DROP TABLE IF EXISTS IMAGEM_TAGS;
DROP TABLE IF EXISTS ALBUNS;
DROP TABLE IF EXISTS IMAGENS;
DROP TABLE IF EXISTS CATEGORIAS;
DROP TABLE IF EXISTS TAGS;
DROP TABLE IF EXISTS AMIZADES;
DROP TABLE IF EXISTS USUARIOS;


-- 1. Tabela: USUARIOS
-- Armazena os dados principais dos usuários.
CREATE TABLE USUARIOS (
    UsuarioID        INT PRIMARY KEY AUTO_INCREMENT,
    NomeUsuario      VARCHAR(50) UNIQUE NOT NULL,
    Email            VARCHAR(100) UNIQUE NOT NULL,
    SenhaHash        VARCHAR(255) NOT NULL,
    DataRegistro     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UltimoLogin      DATETIME
);

-- Índices para otimizar buscas por nome de usuário e email.
CREATE INDEX idx_usuarios_nomeusuario ON USUARIOS (NomeUsuario);
CREATE INDEX idx_usuarios_email ON USUARIOS (Email);


-- 2. Tabela: AMIZADES
-- Armazena os relacionamentos entre usuários.
CREATE TABLE AMIZADES (
    AmizadeID            INT PRIMARY KEY AUTO_INCREMENT,
    UsuarioSolicitanteID INT NOT NULL,
    UsuarioAceitanteID   INT NOT NULL,
    -- Usar ENUM melhora a integridade dos dados, limitando os valores possíveis.
    Status               ENUM('pendente', 'aceita', 'recusada', 'bloqueada') NOT NULL DEFAULT 'pendente',
    DataSolicitacao      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    DataInicioAmizade    DATETIME,
    FOREIGN KEY (UsuarioSolicitanteID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    FOREIGN KEY (UsuarioAceitanteID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    -- Garante que um par de amizade seja único.
    UNIQUE (UsuarioSolicitanteID, UsuarioAceitanteID),
    -- Garante que um usuário não possa ser amigo de si mesmo.
    CONSTRAINT chk_amizade_self_ref CHECK (UsuarioSolicitanteID <> UsuarioAceitanteID)
);


-- 3. Tabela: TAGS
-- Armazena tags criadas por usuários para organizar suas imagens.
CREATE TABLE TAGS (
    TagID       INT PRIMARY KEY AUTO_INCREMENT,
    Nome        VARCHAR(50) NOT NULL,
    UsuarioID   INT NOT NULL, -- Dono da tag
    FOREIGN KEY (UsuarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    -- Garante que um usuário não tenha duas tags com o mesmo nome.
    UNIQUE (Nome, UsuarioID)
);


-- 4. Tabela: CATEGORIAS
-- Armazena categorias. Podem ser globais (UsuarioID é NULL) ou de um usuário.
CREATE TABLE CATEGORIAS (
    CategoriaID INT PRIMARY KEY AUTO_INCREMENT,
    Nome        VARCHAR(100) UNIQUE NOT NULL, -- Nomes de categoria devem ser únicos
    UsuarioID   INT, -- NULL para categorias globais
    FOREIGN KEY (UsuarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE
);

-- Inserindo categorias globais pré-definidas
INSERT INTO CATEGORIAS (Nome) VALUES
('Abstrato'), ('Animais'), ('Arquitetura'), ('Arte de Rua'), ('Aventura'),
('Bebês'), ('Bebidas'), ('Beleza'), ('Casamentos'), ('Carros'), ('Céu'),
('Cidades'), ('Ciência'), ('Comida'), ('Conceitual'), ('Crianças'),
('Cultura'), ('Dança'), ('Design'), ('Documental'), ('Drone'), ('Esportes'),
('Estilo de Vida'), ('Estúdio'), ('Eventos'), ('Família'), ('Fantasia'),
('Fauna'), ('Festas'), ('Financeiro'), ('Fitness'), ('Flora'), ('Flores'),
('Floresta'), ('Fotografia Aérea'), ('Fotografia de Produto'), ('Galáxias'),
('Gastronomia'), ('Geométrico'), ('Gradiente'), ('Gráfico'), ('Industrial'),
('Insetos'), ('Interior'), ('Inverno'), ('Jornalismo'), ('Luzes'),
('Minimalista'), ('Moda'), ('Montanhas'), ('Música'), ('Natureza'),
('Negócios'), ('Neon'), ('Noturno'), ('Nuvens'), ('Oceano'), ('Outono'),
('Paisagens'), ('Pessoas'), ('Pintura'), ('Pôr do Sol'), ('Praia'),
('Preto e Branco'), ('Primavera'), ('Religião'), ('Retratos'), ('Rochas'),
('Saúde'), ('Selvagem'), ('Silhueta'), ('Simetria'), ('Subaquático'),
('Sustentabilidade'), ('Tecnologia'), ('Texturas'), ('Trabalho'),
('Trânsito'), ('Urbano'), ('Verão'), ('Viagens'), ('Vida Selvagem'),
('Vintage'), ('Macro'), ('Microscopia'), ('Astrologia'), ('Espaço'),
('Aéreo'), ('Esportes Radicais'), ('Automotivo'), ('Aviação'), ('Construção'),
('Educação'), ('Militar'), ('Medicina'), ('Ciência de Dados'), ('História'),
('Geologia'), ('Vulcanologia'), ('Padrões'), ('Reflexos'), ('Sombras'),
('Minimalismo Urbano'), ('Retrato Corporativo'), ('Comida de Rua'),
('Agricultura'), ('Robótica'), ('Realidade Virtual'), ('Fogo'), ('Gelo');


-- 5. Tabela: IMAGENS
-- Armazena metadados sobre as imagens enviadas.
CREATE TABLE IMAGENS (
    ImagemID          INT PRIMARY KEY AUTO_INCREMENT,
    NomeArquivo       VARCHAR(255) NOT NULL,
    Url               VARCHAR(500) UNIQUE NOT NULL, -- URL para o arquivo da imagem
    Descricao         TEXT,
    DataUpload        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    DataModificacao   DATETIME,
    UsuarioID         INT NOT NULL, -- Dono da imagem
    CategoriaID       INT, -- Relacionamento opcional com Categoria
    FOREIGN KEY (UsuarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    FOREIGN KEY (CategoriaID) REFERENCES CATEGORIAS(CategoriaID) ON DELETE SET NULL
);


-- 6. Tabela: ALBUNS
-- Armazena informações sobre os álbuns criados pelos usuários.
CREATE TABLE ALBUNS (
    AlbumID           INT PRIMARY KEY AUTO_INCREMENT,
    UsuarioID         INT NOT NULL, -- Dono do álbum
    Nome              VARCHAR(100) NOT NULL,
    Descricao         VARCHAR(500),
    DataCriacao       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    DataModificacao   DATETIME,
    FOREIGN KEY (UsuarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE
);


-- 7. Tabela: IMAGEM_TAGS (Tabela de Junção N:N)
-- Associa múltiplas tags a múltiplas imagens.
CREATE TABLE IMAGEM_TAGS (
    ImagemID INT NOT NULL,
    TagID    INT NOT NULL,
    PRIMARY KEY (ImagemID, TagID),
    FOREIGN KEY (ImagemID) REFERENCES IMAGENS(ImagemID) ON DELETE CASCADE,
    FOREIGN KEY (TagID) REFERENCES TAGS(TagID) ON DELETE CASCADE
);


-- 8. Tabela: IMAGEM_ALBUNS (Tabela de Junção N:N)
-- Associa múltiplas imagens a múltiplos álbuns.
CREATE TABLE IMAGEM_ALBUNS (
    ImagemID      INT NOT NULL,
    AlbumID       INT NOT NULL,
    PRIMARY KEY (ImagemID, AlbumID),
    FOREIGN KEY (ImagemID) REFERENCES IMAGENS(ImagemID) ON DELETE CASCADE,
    FOREIGN KEY (AlbumID) REFERENCES ALBUNS(AlbumID) ON DELETE CASCADE
);


CREATE TABLE COMPARTILHAMENTOS (
    CompartilhamentoID    INT PRIMARY KEY AUTO_INCREMENT,
    UsuarioRemetenteID    INT NOT NULL,
    UsuarioDestinatarioID INT NOT NULL,
    ImagemID              INT, -- Pode ser NULO se estiver compartilhando um álbum
    AlbumID               INT, -- Pode ser NULO se estiver compartilhando uma imagem
    DataCompartilhamento  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- ENUM atualizado para as novas permissões.
    Permissao             ENUM('compartilhado', 'editavel') NOT NULL DEFAULT 'compartilhado',
    FOREIGN KEY (UsuarioRemetenteID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    FOREIGN KEY (UsuarioDestinatarioID) REFERENCES USUARIOS(UsuarioID) ON DELETE CASCADE,
    FOREIGN KEY (ImagemID) REFERENCES IMAGENS(ImagemID) ON DELETE CASCADE,
    FOREIGN KEY (AlbumID) REFERENCES ALBUNS(AlbumID) ON DELETE CASCADE,
    -- Garante que o mesmo item não seja compartilhado duas vezes para o mesmo usuário.
    UNIQUE (UsuarioRemetenteID, UsuarioDestinatarioID, ImagemID, AlbumID),
    -- Garante que ou uma imagem ou um álbum seja compartilhado, mas não ambos ao mesmo tempo.
    CONSTRAINT chk_compartilhamento_item CHECK ((ImagemID IS NOT NULL AND AlbumID IS NULL) OR (ImagemID IS NULL AND AlbumID IS NOT NULL))
);