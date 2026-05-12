const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

/**
 * AssistanceSessionRepository – accès à la table SESSIONS_ASSISTANCE
 * Gère le cycle de vie des sessions Multi-Agents V2 (UUID).
 */
class AssistanceSessionRepository extends BaseRepository {
    constructor() {
        super(pool, 'SESSIONS_ASSISTANCE');
    }

    /**
     * Crée une nouvelle session d'assistance.
     * @param {{ id: string, user_id: string, avatar_id: number }} data
     */
    async create({ id, user_id, avatar_id }) {
        await this.pool.execute(
            `INSERT INTO SESSIONS_ASSISTANCE (id, user_id, avatar_id, statut, date_debut)
             VALUES (?, ?, ?, 'active', NOW())`,
            [id, user_id, avatar_id]
        );
        return id;
    }

    /**
     * Charge une session par son UUID.
     * @param {string} sessionId
     * @returns {Promise<Object|null>}
     */
    async findById(sessionId) {
        const [rows] = await this.pool.query(
            `SELECT s.*, a.nom_avatar, a.prompt_systeme, a.ragflow_dataset_id, a.vocal_id
             FROM SESSIONS_ASSISTANCE s
             JOIN AVATARS_ASSISTANTS a ON s.avatar_id = a.id
             WHERE s.id = ?`,
            [sessionId]
        );
        return rows[0] || null;
    }

    /**
     * Finalise une session (statut → 'terminee').
     * @param {string} sessionId
     */
    async finalize(sessionId) {
        await this.pool.execute(
            `UPDATE SESSIONS_ASSISTANCE SET statut = 'terminee' WHERE id = ?`,
            [sessionId]
        );
    }

    /**
     * Liste toutes les sessions d'un utilisateur.
     * @param {string} userId
     * @returns {Promise<Array>}
     */
    async findByUserId(userId) {
        const [rows] = await this.pool.query(
            `SELECT s.id, s.statut, s.date_debut, a.nom_avatar
             FROM SESSIONS_ASSISTANCE s
             JOIN AVATARS_ASSISTANTS a ON s.avatar_id = a.id
             WHERE s.user_id = ?
             ORDER BY s.date_debut DESC`,
            [userId]
        );
        return rows;
    }
}

module.exports = new AssistanceSessionRepository();
