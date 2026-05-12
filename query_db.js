const pool = require('./db/connection');

async function queryDb() {
    try {
        const [rows] = await pool.query('SELECT * FROM excel_4_1774361403564 LIMIT 5');
        console.log('--- excel_4_1774361403564 ---');
        console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error('❌ DB Error:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

queryDb();
