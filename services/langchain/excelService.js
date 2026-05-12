let XLSX;
try {
    XLSX = require('xlsx');
} catch (err) {
    console.warn('[ExcelService] xlsx not installed - Excel upload disabled');
    XLSX = null;
}
const fs = require('fs');
const path = require('path');
const connection = require('../../db/connection');

/**
 * ExcelService - Gestion complète de l'upload et l'intégration des fichiers Excel
 * 
 * Étapes :
 * 1. Lire le fichier Excel avec xlsx
 * 2. Détecter les types de colonnes (string, number, date)
 * 3. Créer une table MySQL dynamique
 * 4. Insérer les données
 * 5. Sauvegarder le schéma dans excel_schemas
 */
class ExcelService {
    /**
     * Traite un fichier Excel complet et l'intègre en BD
     * @param {string} filePath - Chemin local du fichier Excel
     * @param {string} originalFilename - Nom d'origine du fichier
     * @param {number} avatarId - ID de l'avatar propriétaire du fichier
     * @returns {Promise<{ success: boolean, table_name: string, schema: Object, row_count: number }>}
     */
    async processExcelFile(filePath, originalFilename, avatarId) {
        if (!XLSX) {
            throw new Error('Excel support not available - xlsx package not installed');
        }

        console.log(`[ExcelService] Traitement de ${originalFilename} pour avatar_${avatarId}`);

        try {
            // ── ÉTAPE 1 : Lire le fichier Excel ──
            console.log('[ExcelService] Étape 1 : Lecture du fichier Excel');
            const workbook = XLSX.readFile(filePath);
            
            let data = [];
            for (const sheetName of workbook.SheetNames) {
                const worksheet = workbook.Sheets[sheetName];
                const sheetData = XLSX.utils.sheet_to_json(worksheet);
                
                // Injecter le nom de la feuille dans les données pour traçabilité du RAG MySQL
                for (const row of sheetData) {
                    row['_nom_feuille'] = sheetName;
                }
                
                data = data.concat(sheetData);
            }

            if (!data || data.length === 0) {
                throw new Error('Le fichier Excel est vide ou invalide');
            }

            console.log(`[ExcelService] ${data.length} lignes lues`);

            // ── ÉTAPE 2 : Détecter les types de colonnes ──
            console.log('[ExcelService] Étape 2 : Détection des types');
            const schema = this._detectColumnTypes(data);
            console.log(`[ExcelService] Colonnes détectées: ${JSON.stringify(schema)}`);

            // ── ÉTAPE 3 : Créer une table MySQL dynamique ──
            console.log('[ExcelService] Étape 3 : Création de la table MySQL');
            const timestamp = Date.now();
            const tableName = `excel_${avatarId}_${timestamp}`;
            await this._createTable(tableName, schema);
            console.log(`[ExcelService] Table créée: ${tableName}`);

            // ── ÉTAPE 4 : Insérer les données ──
            console.log('[ExcelService] Étape 4 : Insertion des données');
            const insertedCount = await this._insertData(tableName, data, schema);
            console.log(`[ExcelService] ${insertedCount} lignes insérées`);

            // ── ÉTAPE 5 : Sauvegarder le schéma ──
            console.log('[ExcelService] Étape 5 : Sauvegarde du schéma');
            const schemaRecord = {
                avatar_id: avatarId,
                table_name: tableName,
                original_filename: originalFilename,
                schema_json: JSON.stringify({
                    colonnes: schema,
                    total_lignes: insertedCount,
                    sheet_names: workbook.SheetNames
                })
            };
            await this._saveSchema(schemaRecord);
            console.log('[ExcelService] Schéma sauvegardé');

            return {
                success: true,
                table_name: tableName,
                schema,
                row_count: insertedCount,
                message: `${insertedCount} lignes importées avec succès dans ${tableName}`
            };

        } catch (error) {
            console.error('[ExcelService] Erreur:', error.message);
            throw error;
        } finally {
            // Nettoyer le fichier temporaire
            if (fs.existsSync(filePath)) {
                fs.unlink(filePath, (err) => {
                    if (err) console.warn('[ExcelService] Fichier temporaire verrouillé, suppression différée:', err.message);
                });
            }
        }
    }

    /**
     * Détecte les types de colonnes à partir des données
     * @private
     */
    _detectColumnTypes(data) {
        if (!data || data.length === 0) return [];

        // Extraire toutes les clés uniques de toutes les lignes (fusion des schémas)
        const columnsSet = new Set();
        for (const row of data) {
            Object.keys(row).forEach(k => columnsSet.add(k));
        }
        const columns = Array.from(columnsSet);

        return columns.map(colName => {
            const type = this._inferType(data, colName);
            return {
                nom: colName,
                type: type
            };
        });
    }

    /**
     * Détecte le type d'une colonne en analysant ses valeurs
     * @private
     */
    _inferType(data, colName) {
        const samples = data.slice(0, Math.min(10, data.length)).map(row => row[colName]);

        let numCount = 0;
        let dateCount = 0;
        let stringCount = 0;

        for (const val of samples) {
            if (val === null || val === undefined || val === '') {
                continue;
            }

            // Test date (ISO string ou timestamp)
            if (this._isDate(val)) {
                dateCount++;
            }
            // Test nombre
            else if (!isNaN(val) && val !== '') {
                numCount++;
            }
            // Sinon string
            else {
                stringCount++;
            }
        }

        // Déterminer le type majoritaire
        if (dateCount > stringCount && dateCount > numCount) {
            return 'datetime';
        } else if (numCount > stringCount) {
            return 'decimal(10,2)';
        } else {
            return 'varchar(255)';
        }
    }

    /**
     * Vérifie si une valeur est une date
     * @private
     */
    _isDate(val) {
        if (typeof val === 'number' && val > 1000) {
            // Possiblement un timestamp Excel
            return true;
        }
        if (typeof val === 'string') {
            // Essayer de parser une date ISO ou format courant
            const date = new Date(val);
            return date instanceof Date && !isNaN(date.getTime());
        }
        return false;
    }

    /**
     * Crée une table MySQL avec les colonnes détectées
     * @private
     */
    async _createTable(tableName, schema) {
        // Construire la requête CREATE TABLE
        const columnDefs = schema.map(col => {
            let sqlType = 'VARCHAR(255)'; // défaut

            if (col.type === 'decimal(10,2)') {
                sqlType = 'DECIMAL(10, 2)';
            } else if (col.type === 'datetime') {
                sqlType = 'DATETIME';
            } else if (col.type.startsWith('varchar')) {
                sqlType = col.type;
            }

            return `\`${col.nom}\` ${sqlType}`;
        }).join(', ');

        const createSQL = `
            CREATE TABLE ${tableName} (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ${columnDefs},
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        console.log(`[ExcelService] SQL: ${createSQL.substring(0, 100)}...`);

        try {
            const [result] = await connection.query(createSQL);
            return result;
        } catch (err) {
            throw new Error(`Erreur création table: ${err.message}`);
        }
    }

    /**
     * Insère les données de l'Excel dans la table
     * @private
     */
    async _insertData(tableName, data, schema) {
        if (data.length === 0) {
            return 0;
        }

        // Préparer les valeurs INSERT
        const insertValues = data.map(row => {
            const values = schema.map(col => {
                let val = row[col.nom];

                // Convertir les dates Excel en format MySQL
                if (col.type === 'datetime' && typeof val === 'number') {
                    // Nombre Excel = date (jours depuis 1900)
                    val = this._excelDateToJsDate(val).toISOString().slice(0, 19);
                }

                // Échapper les valeurs
                if (val === null || val === undefined) {
                    return 'NULL';
                } else if (typeof val === 'string') {
                    return connection.escape(val);
                } else {
                    return connection.escape(val);
                }
            });

            return `(${values.join(', ')})`;
        });

        // Construire la requête INSERT
        const columns = schema.map(col => `\`${col.nom}\``).join(', ');
        const insertSQL = `
            INSERT INTO ${tableName} (${columns})
            VALUES ${insertValues.join(', ')}
        `;

        try {
            const [result] = await connection.query(insertSQL);
            return result.affectedRows;
        } catch (err) {
            throw new Error(`Erreur insertion données: ${err.message}`);
        }
    }

    /**
     * Convertit une date Excel en date JavaScript
     * @private
     */
    _excelDateToJsDate(excelDate) {
        // Date d'époque Excel : 30 décembre 1899
        const EPOCH = new Date(1899, 11, 30);
        return new Date(EPOCH.getTime() + excelDate * 24 * 60 * 60 * 1000);
    }

    /**
     * Sauvegarde le schéma dans la table excel_schemas
     * @private
     */
    async _saveSchema(schemaRecord) {
        const insertSQL = `
            INSERT INTO excel_schemas 
            (avatar_id, table_name, original_filename, schema_json)
            VALUES (?, ?, ?, ?)
        `;

        try {
            const [result] = await connection.query(insertSQL, [
                schemaRecord.avatar_id,
                schemaRecord.table_name,
                schemaRecord.original_filename,
                schemaRecord.schema_json
            ]);
            return result;
        } catch (err) {
            throw new Error(`Erreur sauvegarde schéma: ${err.message}`);
        }
    }

    /**
     * Récupère tous les schémas Excel (pour l'affichage dashboard admin)
     */
    async getAllSchemas() {
        const sql = `
            SELECT e.*, a.nom_avatar 
            FROM excel_schemas e 
            LEFT JOIN AVATARS_ASSISTANTS a ON e.avatar_id = a.id
            ORDER BY e.created_at DESC
        `;
        const [rows] = await connection.query(sql);
        return rows;
    }

    /**
     * Récupère un schéma par son ID
     */
    async getSchemaById(id) {
        const [rows] = await connection.query('SELECT * FROM excel_schemas WHERE id = ?', [id]);
        return rows[0];
    }

    /**
     * Supprime un schéma et la table associée
     */
    async deleteSchema(id) {
        const schema = await this.getSchemaById(id);
        if (!schema) throw new Error('Schéma introuvable');
        
        // 1. Supprimer la table dynamique
        await connection.query(`DROP TABLE IF EXISTS \`${schema.table_name}\``);
        
        // 2. Supprimer l'enregistrement
        await connection.query('DELETE FROM excel_schemas WHERE id = ?', [id]);
        return true;
    }
}

module.exports = new ExcelService();
