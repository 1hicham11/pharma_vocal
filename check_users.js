const pool = require('./db/connection');

async function checkUsers() {
    try {
        const [rows] = await pool.query('SELECT id, nom, prenom, email, role FROM utilisateurs');
        console.log('Users in database:', rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUsers();
