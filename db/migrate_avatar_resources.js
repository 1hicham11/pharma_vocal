const pool = require('./connection');

async function migrate() {
    try {
        console.log('--- Migration: Création de la table avatar_resources ---');
        
        // 1. Créer la nouvelle table avec clé étrangère
        await pool.query(`
            CREATE TABLE IF NOT EXISTS avatar_resources (
                id INT AUTO_INCREMENT PRIMARY KEY,
                avatar_id INT NOT NULL,
                rag TINYINT(1) DEFAULT 1,
                db TINYINT(1) DEFAULT 1,
                knowledge TINYINT(1) DEFAULT 1,
                FOREIGN KEY (avatar_id) REFERENCES AVATARS_ASSISTANTS(id) ON DELETE CASCADE,
                UNIQUE KEY unique_avatar (avatar_id)
            )
        `);
        console.log('✅ Table avatar_resources créée ou vérifiée.');

        // 2. Migrer les données existantes de AVATARS_ASSISTANTS vers avatar_resources
        console.log('Migration des données existantes...');
        
        // On récupère tous les avatars actuels
        const [avatars] = await pool.query('SELECT id, use_rag, use_db, use_knowledge FROM AVATARS_ASSISTANTS');
        
        for (const avatar of avatars) {
            // Insérer dans la nouvelle table ou mettre à jour si elle existe déjà (upsert)
            await pool.query(`
                INSERT INTO avatar_resources (avatar_id, rag, db, knowledge)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                rag = VALUES(rag), db = VALUES(db), knowledge = VALUES(knowledge)
            `, [
                avatar.id, 
                avatar.use_rag !== null ? avatar.use_rag : 1, 
                avatar.use_db !== null ? avatar.use_db : 1, 
                avatar.use_knowledge !== null ? avatar.use_knowledge : 1
            ]);
        }
        
        console.log(`✅ Données migrées pour ${avatars.length} avatars.`);
        
        console.log('Migration terminée avec succès.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur migration:', err.message);
        process.exit(1);
    }
}

migrate();