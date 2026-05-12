const pool = require('./db/connection');

async function migrate() {
    try {
        console.log('--- MIGRATION DATABASE ---');

        // 1. Créer la table de liaison
        await pool.query(`
      CREATE TABLE IF NOT EXISTS session_medicaments (
        session_id CHAR(36) NOT NULL,
        medicament_id INT NOT NULL,
        PRIMARY KEY (session_id, medicament_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (medicament_id) REFERENCES medicaments(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
        console.log('✅ Table session_medicaments créée.');

        // 2. Rendre medicament_id nullable dans sessions
        await pool.query(`
      ALTER TABLE sessions MODIFY medicament_id INT NULL;
    `);
        console.log('✅ Table sessions modifiée (medicament_id est maintenant NULLable).');

        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur de migration:', err);
        process.exit(1);
    }
}

migrate();
