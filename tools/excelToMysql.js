const fs = require('fs');
const path = require('path');
const pool = require('../db/connection');

/**
 * Étape 3 — Convertir CSV en MySQL (Version Native)
 * Traite tous les fichiers CSV d'un dossier et les injecte dans une table spécifique.
 */
async function convertAllCSVFiles(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
        console.error(`[CSVToMysql] Dossier non trouvé : ${directoryPath}`);
        return;
    }

    const files = fs.readdirSync(directoryPath).filter(f => f.endsWith('.csv'));

    if (files.length === 0) {
        console.log("[CSVToMysql] Aucun fichier CSV trouvé.");
        return;
    }

    console.log(`[CSVToMysql] ${files.length} fichier(s) CSV détecté(s).`);

    for (const file of files) {
        const filePath = path.join(directoryPath, file);
        const tableName = path.parse(file).name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        
        console.log(`[CSVToMysql] Traitement de : ${file} -> Table : ${tableName}`);
        
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            if (lines.length < 2) continue;

            const headers = lines[0].split(',').map(h => h.trim());
            const data = lines.slice(1).map(line => {
                const values = line.split(',').map(v => v.trim());
                const obj = {};
                headers.forEach((h, i) => obj[h] = values[i]);
                return obj;
            });

            // 1. Création dynamique de la table si elle n'existe pas
            const createTableSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ${headers.map(h => `\`${h}\` TEXT`).join(', ')},
                imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;`;

            await pool.query(createTableSQL);

            // 2. Insertion des données
            for (const row of data) {
                const values = headers.map(h => row[h] || null);
                const insertSQL = `INSERT INTO ${tableName} (${headers.map(h => `\`${h}\``).join(', ')}) VALUES (${headers.map(() => '?').join(', ')})`;
                await pool.execute(insertSQL, values);
            }

            console.log(`✅ ${file} importé avec succès (${data.length} lignes).`);
        } catch (error) {
            console.error(`❌ Erreur sur ${file} :`, error);
        }
    }
}

const targetDir = process.argv[2] || path.join(__dirname, '../uploads');
convertAllCSVFiles(targetDir).then(() => {
    console.log("--- Fin du traitement CSV ---");
    process.exit(0);
});
