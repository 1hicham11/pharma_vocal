const pool = require('./connection');

async function migrate() {
    try {
        console.log('--- Migration: Ajout des colonnes de réglages aux Avatars ---');
        
        // Vérifier si les colonnes existent déjà pour éviter les erreurs
        const [columns] = await pool.query('SHOW COLUMNS FROM AVATARS_ASSISTANTS');
        const columnNames = columns.map(c => c.Field);

        const newColumns = [
            { name: 'use_rag', type: 'TINYINT(1) DEFAULT 1' },
            { name: 'use_db', type: 'TINYINT(1) DEFAULT 1' },
            { name: 'use_knowledge', type: 'TINYINT(1) DEFAULT 1' },
            { name: 'manual_ranking', type: 'TINYINT(1) DEFAULT 0' },
            { name: 'resource_ranking', type: 'TEXT NULL' }
        ];

        for (const col of newColumns) {
            if (!columnNames.includes(col.name)) {
                console.log(`Ajout de la colonne ${col.name}...`);
                await pool.query(`ALTER TABLE AVATARS_ASSISTANTS ADD COLUMN ${col.name} ${col.type}`);
            } else {
                console.log(`La colonne ${col.name} existe déjà.`);
            }
        }

        console.log('✅ Migration terminée avec succès.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur migration:', err.message);
        process.exit(1);
    }
}

migrate();
