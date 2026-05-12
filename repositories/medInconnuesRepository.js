const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

/**
 * MedInconnuesRepository
 * Gère les médicaments non référencés détectés dans les sessions.
 * Table : medicaments_inconnus
 */
class MedInconnuesRepository extends BaseRepository {
    constructor() {
        super(pool, 'medicaments_inconnus');
    }

    /**
     * Insère un médicament inconnu.
     * @param {Object} data  { session_id, nom_mentionne }
     * @returns {Promise<number>}  insertId
     */
    async create(data) {
        const { session_id, nom_medicament } = data;
        const [result] = await this.pool.query(
            `INSERT INTO medicaments_inconnus (session_id, nom_medicament) VALUES (?, ?)`,
            [session_id, nom_medicament]
        );
        return result.insertId;
    }

    /**
     * Enregistre un médicament inconnu détecté dans une session.
     * @param {string} sessionId
     * @param {string} nomMedicament
     */
    async saveUnknown(sessionId, nomMedicament) {
        await this.pool.query(
            `INSERT INTO medicaments_inconnus (session_id, nom_medicament) VALUES (?, ?)`,
            [sessionId, nomMedicament]
        );
    }

    /**
     * Récupère tous les médicaments inconnus (pour l'admin).
     * @returns {Promise<Array>}
     */
    async getAll() {
        const [rows] = await this.pool.query(
            'SELECT * FROM medicaments_inconnus ORDER BY detecte_le DESC'
        );
        return rows;
    }

    /**
     * Supprime un médicament inconnu par son id.
     * @param {number} id
     */
    async deleteById(id) {
        await this.pool.query('DELETE FROM medicaments_inconnus WHERE id = ?', [id]);
    }

    /**
     * Récupère les médicaments inconnus d'une session.
     * @param {string} sessionId
     * @returns {Promise<Array>}
     */
    async findBySessionId(sessionId) {
        const [rows] = await this.pool.query(
            'SELECT * FROM medicaments_inconnus WHERE session_id = ?',
            [sessionId]
        );
        return rows;
    }
}

module.exports = new MedInconnuesRepository();
