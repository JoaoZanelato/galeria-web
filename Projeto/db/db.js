// projeto/db/db.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'galeria_web_db', // Nome do DB que você quer criar/usar
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// --- Modificação para criar o DB se não existir (PARA DESENVOLVIMENTO) ---
async function createDatabaseIfNotExists() {
    console.log(`Verificando/Criando o banco de dados: ${dbConfig.database}`);
    let connectionWithoutDb; // Conexão sem especificar o banco de dados
    try {
        // Tenta conectar ao servidor MySQL/MariaDB sem um DB específico
        // Isso requer que o DB_USER tenha permissão para criar bancos de dados
        connectionWithoutDb = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        // Comando para criar o banco de dados se ele não existir
        await connectionWithoutDb.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
        console.log(`Banco de dados '${dbConfig.database}' verificado/criado com sucesso.`);

    } catch (err) {
        console.error('Erro ao verificar/criar o banco de dados:', err.message);
        console.error('Verifique se o usuário do DB tem permissão para criar bancos de dados.');
        process.exit(1); // Aborta se não conseguir criar o DB
    } finally {
        if (connectionWithoutDb) connectionWithoutDb.end(); // Fecha a conexão
    }
}
// --- Fim da modificação ---


// Cria um pool de conexões (este pool se conectará ao DB especificado em dbConfig.database)
const pool = mysql.createPool(dbConfig);

async function setupDatabaseSchema() {
    console.log('Iniciando configuração do esquema do banco de dados...');
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('Conexão ao banco de dados estabelecida para setup.');

        const schemaSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
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
        console.error('Mensagem SQL:', err.sqlMessage);
        process.exit(1);
    } finally {
        if (connection) connection.release();
    }
}

async function initializeDatabase() {
    try {
        // 1. Tenta criar o banco de dados se não existir
        await createDatabaseIfNotExists(); // <-- NOVO PASSO AQUI!

        // 2. Agora, testa a conexão ao banco de dados específico e configura o esquema
        const connection = await pool.getConnection();
        console.log(`Conectado ao banco de dados '${dbConfig.database}'!`);
        connection.release();

        // --- APENAS PARA DESENVOLVIMENTO INICIAL ---
        // Descomente esta linha para recriar as tabelas a cada início do app.
        await setupDatabaseSchema();

    } catch (err) {
        console.error('--- ERRO FATAL: Falha ao conectar ou configurar o banco de dados ---');
        console.error('Mensagem do erro:', err.message);
        console.error('Verifique:');
        console.error('  1. Suas credenciais no arquivo .env (DB_HOST, DB_USER, DB_PASSWORD).');
        console.error('  2. Se o servidor MySQL/MariaDB está rodando.');
        console.error('  3. Se o usuário do DB tem permissões para se conectar e criar o DB/tabelas.');
        process.exit(1);
    }
}

initializeDatabase();
module.exports = pool;