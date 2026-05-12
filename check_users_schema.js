const pool = require('./db/connection');

async function check() {
    try {
        const [columns] = await pool.query('SHOW COLUMNS FROM utilisateurs');
        console.log('Columns in utilisateurs:', columns.map(c => c.Field));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
