const bcrypt = require('bcryptjs');
const pool = require('./db/connection');

async function createAdmin() {
    try {
        console.log('--- Creating Admin User ---');
        
        const email = 'admin@pharma.com';
        const nom = 'Admin';
        const prenom = 'Pharma';
        const password = 'Admin@2026!';
        
        // Hash du mot de passe
        const hash = await bcrypt.hash(password, 10);
        
        // Vérifier si l'admin existe déjà
        const [existing] = await pool.query('SELECT * FROM ADMINISTRATEURS WHERE email = ?', [email]);
        
        if (existing.length > 0) {
            console.log('❌ Admin déjà existant. Mise à jour...');
            await pool.query('UPDATE ADMINISTRATEURS SET mot_de_passe = ? WHERE email = ?', [hash, email]);
        } else {
            console.log('✅ Création d\'un nouvel admin...');
            await pool.query(
                'INSERT INTO ADMINISTRATEURS (nom, prenom, email, mot_de_passe) VALUES (?, ?, ?, ?)',
                [nom, prenom, email, hash]
            );
        }
        
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║    ✅ ADMIN CRÉÉ AVEC SUCCÈS          ║');
        console.log('╠════════════════════════════════════════╣');
        console.log(`║ Email: ${email.padEnd(33)}║`);
        console.log(`║ Mot de passe: ${password.padEnd(24)}║`);
        console.log('╚════════════════════════════════════════╝\n');
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur:', err.message);
        process.exit(1);
    }
}

createAdmin();
