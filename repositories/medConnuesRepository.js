const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

/**
 * MedConnuesRepository
 * Gère les liens session ↔ médicament connu.
 * Table : medicaments_connues
 */
class MedConnuesRepository extends BaseRepository {
    constructor() {
        super(pool, 'medicaments_connues');
    }

    /**
     * Crée un lien session ↔ médicament.
     * @param {Object} data  { session_id, medicament_id }
     * @returns {Promise<number>}  insertId
     */
    async create(data) {
        const { session_id, medicament_id } = data;
        const [result] = await this.pool.execute(
            `INSERT INTO medicaments_connues (session_id, medicament_id) VALUES (?, ?)`,
            [session_id, medicament_id]
        );
        return result.insertId;
    }

    /**
     * Enregistre la relation session ↔ médicament (avec score optionnel).
     * @param {string} sessionId
     * @param {number} medicamentId
     * @param {number|null} score
     */
    async saveLink(sessionId, medicamentId, score = null) {
        await this.pool.execute(
            `INSERT INTO medicaments_connues (session_id, medicament_id, score_medicament) 
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE score_medicament = VALUES(score_medicament)`,
            [sessionId, medicamentId, score]
        );
    }

    /**
     * Récupère tous les médicaments connus d'une session.
     * @param {string} sessionId
     * @returns {Promise<Array>}
     */
    async findBySessionId(sessionId) {
        const [rows] = await this.pool.query(
            `SELECT mc.*, m.nom_commercial, m.dci 
             FROM medicaments_connues mc
             JOIN medicaments m ON mc.medicament_id = m.id
             WHERE mc.session_id = ?`,
            [sessionId]
        );
        return rows;
    }
}

module.exports = new MedConnuesRepository();
