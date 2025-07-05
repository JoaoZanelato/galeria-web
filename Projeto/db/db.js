// projeto/db/db.js
const mysql = require('mysql2/promise'); // <-- MUDANÇA AQUI: Usar mysql2/promise
const fs = require('fs');
const path = require('path');
// Garante que as variáveis de ambiente do .env sejam carregadas
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Configurações do seu banco de dados
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', // <-- Use a senha correta do seu MySQL/MariaDB
    database: process.env.DB_NAME || 'sua_galeria_db', // <-- Use o nome do seu banco de dados
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Cria um pool de conexões
const pool = mysql.createPool(dbConfig); // <-- MUDANÇA AQUI: pool de mysql2

// Função para configurar o esquema do banco de dados (criar tabelas)
async function setupDatabaseSchema() {
    console.log('Iniciando configuração do esquema do banco de dados...');
    let connection;
    try {
        connection = await pool.getConnection(); // Pega uma conexão do pool
        console.log('Conexão ao banco de dados estabelecida para setup.');

        // Lê o script SQL do arquivo init.sql (que você vai criar)
        const schemaSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8'); // <-- MUDANÇA AQUI: nome do arquivo init.sql

        // Divide o script SQL em comandos individuais
        const sqlCommands = schemaSql.split(';').filter(cmd => cmd.trim() !== '');

        for (const command of sqlCommands) {
            if (command.trim().length > 0) {
                await connection.query(command);
            }
        }

        console.log('Schema do banco de dados criado/atualizado com sucesso!');
    } catch (err) {
        console.error('Erro ao configurar o banco de dados:', err.message);
        console.error('SQL Error Code:', err.code);
        console.error('SQL State:', err.sqlState);
        console.error('SQL Message:', err.sqlMessage);
        process.exit(1); // Sai do processo em caso de erro crítico
    } finally {
        if (connection) connection.release(); // Libera a conexão de volta para o pool
    }
}

// Função para testar a conexão e, opcionalmente, configurar o schema
async function initializeDatabase() {
    try {
        const connection = await pool.getConnection();
        console.log('Conectado ao banco de dados MySQL/MariaDB!');
        connection.release();

        // --- APENAS PARA DESENVOLVIMENTO INICIAL ---
        // Descomente a linha abaixo se você quer que as tabelas sejam criadas
        // TODA VEZ que o app inicia (bom para desenvolvimento rápido).
        // Cuidado: isso pode apagar dados se você tiver DROP TABLE no seu init.sql.
        await setupDatabaseSchema(); // <-- DESCOMENTE ESTA LINHA!

    } catch (err) {
        console.error('--- ERRO FATAL: Falha ao conectar ou configurar o banco de dados ---');
        console.error('Mensagem do erro:', err.message);
        console.error('Verifique:');
        console.error('  1. Suas credenciais no arquivo .env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).');
        console.error('  2. Se o servidor MySQL/MariaDB está rodando.');
        console.error('  3. Se o banco de dados especificado em DB_NAME existe no seu servidor.');
        process.exit(1);
    }
}

initializeDatabase(); // Inicia o processo de conexão e setup

module.exports = pool; // Exporta o pool para ser usado nas rotas e modelos