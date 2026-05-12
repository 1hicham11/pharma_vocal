const pool = require('./connection');

async function migrate() {
    try {
        console.log('--- Migration: Ajout de la colonne role aux utilisateurs ---');
        
        const [columns] = await pool.query('SHOW COLUMNS FROM utilisateurs');
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('role')) {
            console.log('Ajout de la colonne role...');
            await pool.query("ALTER TABLE utilisateurs ADD COLUMN role VARCHAR(50) DEFAULT 'delegue'");
            
            // Mettre un utilisateur en admin par défaut (le premier ou tous pour la démo local)
            console.log('Mise à jour des utilisateurs existants en admin (pour test)...');
            await pool.query("UPDATE utilisateurs SET role = 'admin'");
        } else {
            console.log('La colonne role existe déjà.');
        }

        console.log('✅ Migration terminée.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur migration:', err.message);
        process.exit(1);
    }
}

migrate();
