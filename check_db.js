const pool = require('./db/connection');

async function checkDb() {
    try {
        const [rows] = await pool.query('SHOW TABLES LIKE "RAG_DOCUMENTS"');
        if (rows.length > 0) {
            console.log('✅ Table RAG_DOCUMENTS exists.');
            const [columns] = await pool.query('DESCRIBE RAG_DOCUMENTS');
            console.log('Columns:', columns.map(c => c.Field));
        } else {
            console.log('❌ Table RAG_DOCUMENTS is missing!');
        }
    } catch (err) {
        console.error('❌ DB Error:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

checkDb();
