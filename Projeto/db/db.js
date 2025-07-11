// projeto/db/db.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Carrega as variáveis de ambiente do arquivo .env na raiz do projeto
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// --- Configuração da Conexão com o Banco de Dados Aiven ---
// Os valores são lidos diretamente do arquivo .env
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Configuração de SSL/TLS, essencial para conectar com a Aiven.
    // O certificado é lido diretamente da variável de ambiente DB_CA.
    ssl: {
        ca: process.env.DB_CA
    }
};

// Cria um pool de conexões com a configuração acima.
// O pool gerencia as conexões de forma mais eficiente.
const pool = mysql.createPool(dbConfig);

/**
 * Função para configurar o schema do banco de dados (criar tabelas).
 * Esta função deve ser executada com cautela, geralmente apenas uma vez
 * durante o setup inicial do ambiente ou para migrações controladas.
 */
async function setupDatabaseSchema() {
    console.log('Iniciando configuração do esquema do banco de dados...');
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('Conexão estabelecida para setup do schema.');

        const schemaSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
        const sqlCommands = schemaSql.split(';').filter(cmd => cmd.trim() !== '');

        for (const command of sqlCommands) {
            if (command.trim().length > 0) {
                await connection.query(command);
            }
        }

        console.log('Schema do banco de dados criado/atualizado com sucesso!');
    } catch (err) {
        console.error('Erro ao configurar o schema do banco de dados:', err.message);
        process.exit(1);
    } finally {
        if (connection) connection.release();
    }
}

/**
 * Inicializa e testa a conexão com o banco de dados.
 */
async function initializeDatabase() {
    try {
        // Testa a conexão pegando uma conexão do pool.
        const connection = await pool.getConnection();
        console.log(`Conectado com sucesso ao banco de dados '${dbConfig.database}' no host '${dbConfig.host}'!`);
        connection.release(); // Libera a conexão de volta para o pool.

        // A linha abaixo que cria as tabelas não deve ser executada toda vez que
        // a aplicação inicia em um ambiente de produção.
        // Descomente apenas para o setup inicial.
        // await setupDatabaseSchema();

    } catch (err) {
        console.error('--- ERRO FATAL: Falha ao conectar ao banco de dados na Aiven ---');
        console.error('Mensagem do erro:', err.message);
        console.error('\nVerifique os seguintes pontos no seu arquivo .env:');
        console.error('  1. DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT estão corretos.');
        console.error('  2. A variável DB_CA está presente e contém o certificado correto, incluindo as linhas BEGIN/END CERTIFICATE.');
        console.error('  3. Seu IP está liberado no firewall da Aiven (se aplicável).');
        process.exit(1);
    }
}

// Inicia o processo de conexão ao carregar o módulo.
initializeDatabase();

// Exporta o pool para ser usado em outras partes da aplicação (ex: nas rotas).
module.exports = pool;
