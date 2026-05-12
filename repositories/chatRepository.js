const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

class ChatRepository extends BaseRepository {
    constructor() {
        super(pool, 'message');
    }

    /**
     * Insère un message dans la session.
     * @param {Object} data  { session_id, auteur, contenu }
     */
    async create(data) {
        const { session_id, auteur, contenu } = data;
        try {
            const [result] = await this.pool.query(
                `INSERT INTO message (session_id, auteur, contenue) VALUES (?, ?, ?)`,
                [session_id, auteur, contenu]
            );
            return result;
        } catch (err) {
            if (
                err &&
                (err.code === 'ER_NO_SUCH_TABLE' ||
                    (typeof err.message === 'string' && err.message.includes("pharma_vocal.message")))
            ) {
                // Mode dégradé : on ne persiste pas l'historique mais on ne bloque pas la conversation
                return { insertId: 0 };
            }
            throw err;
        }
    }

    async getHistory(sessionId) {
        try {
            const [rows] = await this.pool.query(
                `SELECT auteur, contenue AS contenu 
       FROM message 
       WHERE session_id = ? 
       ORDER BY timestamp ASC`,
                [sessionId]
            );
            return rows;
        } catch (err) {
            if (
                err &&
                (err.code === 'ER_NO_SUCH_TABLE' ||
                    (typeof err.message === 'string' && err.message.includes("pharma_vocal.message")))
            ) {
                return [];
            }
            throw err;
        }
    }

    async saveMessage(sessionId, auteur, contenu) {
        try {
            const [result] = await this.pool.query(
                `INSERT INTO message (session_id, auteur, contenue) 
       VALUES (?, ?, ?)`,
                [sessionId, auteur, contenu]
            );
            return result;
        } catch (err) {
            if (
                err &&
                (err.code === 'ER_NO_SUCH_TABLE' ||
                    (typeof err.message === 'string' && err.message.includes("pharma_vocal.message")))
            ) {
                return { insertId: 0 };
            }
            throw err;
        }
    }
}

module.exports = new ChatRepository();

