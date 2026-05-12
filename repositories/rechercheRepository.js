const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

/**
 * RechercheRepository – accès à la table ACTIONS_RECHERCHE
 * Assure la traçabilité des appels RAG : sources utilisées + graphe d'entités.
 */
class RechercheRepository extends BaseRepository {
    constructor() {
        super(pool, 'ACTIONS_RECHERCHE');
    }

    /**
     * Enregistre une action de recherche RAG avec ses sources et le graphe d'entités.
     * @param {{
     *   message_id: number,
     *   requete_rag: string,
     *   sources_utilisees: Object   -- { chunks: [], entities: {}, graph_relations: [] }
     * }} data
     * @returns {Promise<number>} insertId
     */
    async saveAction({ message_id, requete_rag, sources_utilisees }) {
        const sourcesJson = JSON.stringify(sources_utilisees);
        const [result] = await this.pool.execute(
            `INSERT INTO ACTIONS_RECHERCHE (message_id, requete_rag, sources_utilisees, date_action)
             VALUES (?, ?, ?, NOW())`,
            [message_id, requete_rag, sourcesJson]
        );
        return result.insertId;
    }

    /**
     * Récupère toutes les actions de recherche d'une session (via JOIN MESSAGES).
     * @param {string} sessionId
     * @returns {Promise<Array>}
     */
    async findBySessionId(sessionId) {
        const [rows] = await this.pool.query(
            `SELECT ar.id, ar.requete_rag, ar.sources_utilisees, ar.date_action
             FROM ACTIONS_RECHERCHE ar
             JOIN MESSAGES m ON ar.message_id = m.id
             WHERE m.session_id = ?
             ORDER BY ar.date_action ASC`,
            [sessionId]
        );
        // Désérialiser le JSON stocké
        return rows.map(r => ({
            ...r,
            sources_utilisees: typeof r.sources_utilisees === 'string'
                ? JSON.parse(r.sources_utilisees)
                : r.sources_utilisees
        }));
    }
}

module.exports = new RechercheRepository();
