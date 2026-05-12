const pool = require('./db/connection');

async function seed() {
    try {
        console.log('--- SEEDING DEMO USER (ROBUST) ---');
        const email = 'med@pharma.com';
        // Hash for 'Med@2026!' generated with bcrypt (10 rounds)
        const hash = '$2b$10$wE7Yn5qUvC9H3mC8w8qC1OXfOYd5O.r1K/S0uYf6K3M5.fOyqN7mS';

        console.log('Checking connection...');
        await pool.query('SELECT 1');
        console.log('DB Connection OK.');

        const [existing] = await pool.query('SELECT * FROM utilisateurs WHERE email = ?', [email]);
        if (existing.length > 0) {
            console.log('Demo user already exists. Updating...');
            await pool.query('UPDATE utilisateurs SET password_hash = ? WHERE email = ?', [hash, email]);
        } else {
            console.log('Inserting demo user...');
            const { v4: uuidv4 } = require('uuid');
            const id = uuidv4();
            await pool.query(
                `INSERT INTO utilisateurs (id, nom, email, password_hash, date_inscription) 
         VALUES (?, ?, ?, ?, NOW())`,
                [id, 'Demo User', email, hash]
            );
        }
        console.log('✅ Seeding success.');
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    }
}

seed();
