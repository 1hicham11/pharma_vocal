const pool = require('./db/connection');

async function main() {
    try {
        await pool.query('ALTER TABLE AVATARS_ASSISTANTS ADD COLUMN icone VARCHAR(10) DEFAULT "👨‍💼" AFTER nom_avatar');
        console.log('Colonne icone ajoutée avec succès.');

        // Update existing ones for better UX
        await pool.query('UPDATE AVATARS_ASSISTANTS SET icone = "📊" WHERE nom_avatar LIKE "%Power BI%"');
        await pool.query('UPDATE AVATARS_ASSISTANTS SET icone = "⚙️" WHERE nom_avatar LIKE "%SAP%"');
        await pool.query('UPDATE AVATARS_ASSISTANTS SET icone = "💊" WHERE nom_avatar LIKE "%Délégué%" OR nom_avatar LIKE "%Cabinet%" OR nom_avatar LIKE "%Berrada%" OR nom_avatar LIKE "%Martin%"');
        await pool.query('UPDATE AVATARS_ASSISTANTS SET icone = "🚚" WHERE nom_avatar LIKE "%Logistique%"');

    } catch (e) {
        if (e.code === 'ER_DUP_COLUMN_NAME') {
            console.log('La colonne icone existe déjà.');
        } else {
            console.error('Erreur:', e);
        }
    } finally {
        process.exit();
    }
}

main();
