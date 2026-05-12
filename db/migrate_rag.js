const pool = require('./db/connection');

async function migrate() {
    try {
        console.log('--- Migration: Création de la table RAG_DOCUMENTS ---');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS RAG_DOCUMENTS (
                id INT AUTO_INCREMENT PRIMARY KEY,
                uuid VARCHAR(36) UNIQUE NOT NULL,
                filename VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'success',
                chunk_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `);
        console.log('✅ Table RAG_DOCUMENTS créée ou déjà existante.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur migration:', err.message);
        process.exit(1);
    }
}

migrate();
