const pool = require('./db/connection');

async function checkSchema() {
    try {
        console.log('--- TABLES IN DATABASE ---');
        const [tablesList] = await pool.query('SHOW TABLES');
        console.table(tablesList);

        const tables = tablesList.map(t => Object.values(t)[0]);
        for (const table of tables) {
            console.log(`\n--- Structure of table: ${table} ---`);
            try {
                const [cols] = await pool.query(`DESCRIBE \`${table}\``);
                console.table(cols.map(c => ({ Field: c.Field, Type: c.Type })));
            } catch (e) {
                console.log(`Error describing ${table}: ${e.message}`);
            }
        }
        await pool.end();
    } catch (err) {
        console.error(err);
    }
}

checkSchema();
