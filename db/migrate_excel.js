const pool = require('./connection');

async function migrate() {
    try {
        console.log('--- Migration: Création de la table excel_schemas ---');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS excel_schemas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                avatar_id INT NOT NULL,
                table_name VARCHAR(255) NOT NULL,
                original_filename VARCHAR(255),
                schema_json JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_excel_avatar FOREIGN KEY (avatar_id) 
                    REFERENCES AVATARS_ASSISTANTS(id) ON DELETE CASCADE,
                INDEX idx_avatar_table (avatar_id, table_name),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB;
        `);
        console.log('✅ Table excel_schemas créée ou déjà existante.');
        
        // Vérifier que la table a bien les colonnes requises
        const [columns] = await pool.query(`
            DESCRIBE excel_schemas;
        `);
        console.log('📋 Colonnes de excel_schemas:');
        columns.forEach(col => {
            console.log(`   - ${col.Field} (${col.Type})`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur migration:', err.message);
        process.exit(1);
    }
}

migrate();
