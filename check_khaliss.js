const pool = require('./db/connection');

async function checkUserKhaliss() {
    try {
        const [rows] = await pool.query("SELECT id, nom, prenom, email, role FROM utilisateurs WHERE nom LIKE '%Khaliss%' OR prenom LIKE '%Khaliss%'");
        console.log('User Khaliss in database:', rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUserKhaliss();
