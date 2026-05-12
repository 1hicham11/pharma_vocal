const pool = require('./db/connection');

async function setupTables() {
    try {
        console.log('--- Creating missing table: RAG_DOCUMENTS ---');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS RAG_DOCUMENTS (
                uuid VARCHAR(36) PRIMARY KEY,
                filename VARCHAR(255) NOT NULL,
                status VARCHAR(20) DEFAULT 'success',
                chunk_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `);
        console.log('✅ Table RAG_DOCUMENTS created or already exists.');
    } catch (err) {
        console.error('❌ Error creating table:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

setupTables();
