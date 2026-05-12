const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

/**
 * MessageAssistanceRepository – accès à la table MESSAGES (V2)
 * Stocke les échanges vocaux (transcription + audio_url optionnelle).
 */
class MessageAssistanceRepository extends BaseRepository {
    constructor() {
        super(pool, 'MESSAGES');
    }

    /**
     * Enregistre un message dans la session.
     * @param {{ session_id: string, auteur: 'utilisateur'|'assistant', transcription_texte: string, audio_url?: string }} data
     * @returns {Promise<number>} insertId
     */
    async saveMessage({ session_id, auteur, transcription_texte, audio_url = null }) {
        const [result] = await this.pool.execute(
            `INSERT INTO MESSAGES (session_id, auteur, transcription_texte, audio_url, date_envoi)
             VALUES (?, ?, ?, ?, NOW())`,
            [session_id, auteur, transcription_texte, audio_url]
        );
        return result.insertId;
    }

    /**
     * Récupère l'historique complet d'une session, dans l'ordre chronologique.
     * @param {string} sessionId
     * @returns {Promise<Array<{ auteur, transcription_texte, date_envoi }>>}
     */
    async getHistory(sessionId) {
        const [rows] = await this.pool.query(
            `SELECT id, auteur, transcription_texte, audio_url, date_envoi
             FROM MESSAGES
             WHERE session_id = ?
             ORDER BY date_envoi ASC`,
            [sessionId]
        );
        return rows;
    }

    /**
     * Compte le nombre de messages d'une session.
     * @param {string} sessionId
     * @returns {Promise<number>}
     */
    async countBySession(sessionId) {
        const [rows] = await this.pool.query(
            `SELECT COUNT(*) AS total FROM MESSAGES WHERE session_id = ?`,
            [sessionId]
        );
        return rows[0].total;
    }
}

module.exports = new MessageAssistanceRepository();
