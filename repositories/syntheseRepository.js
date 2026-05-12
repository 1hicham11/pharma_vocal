const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

/**
 * SyntheseRepository – accès à la table SYNTHESE_ASSISTANCE
 * Stocke le bilan final et les KPIs extraits par le LLM (exploitation Power BI).
 */
class SyntheseRepository extends BaseRepository {
    constructor() {
        super(pool, 'SYNTHESE_ASSISTANCE');
    }

    /**
     * Insère la synthèse finale d'une session.
     * @param {{
     *   id: string,           -- UUID généré par le service
     *   session_id: string,
     *   resume_intervention: string,
     *   succes_aide: boolean,
     *   donnees_metier_json: Object  -- KPIs structurés pour Power BI
     * }} data
     * @returns {Promise<string>} id de la synthèse
     */
    async create({ id, session_id, resume_intervention, succes_aide, donnees_metier_json }) {
        const kpisJson = JSON.stringify(donnees_metier_json);
        await this.pool.execute(
            `INSERT INTO SYNTHESE_ASSISTANCE
               (id, session_id, resume_intervention, succes_aide, donnees_metier_json, date_synthese)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [id, session_id, resume_intervention, succes_aide ? 1 : 0, kpisJson]
        );
        return id;
    }

    /**
     * Récupère la synthèse d'une session.
     * @param {string} sessionId
     * @returns {Promise<Object|null>}
     */
    async findBySessionId(sessionId) {
        const [rows] = await this.pool.query(
            `SELECT id, session_id, resume_intervention, succes_aide, donnees_metier_json, date_synthese
             FROM SYNTHESE_ASSISTANCE
             WHERE session_id = ?`,
            [sessionId]
        );
        if (!rows[0]) return null;
        const row = rows[0];
        return {
            ...row,
            donnees_metier_json: typeof row.donnees_metier_json === 'string'
                ? JSON.parse(row.donnees_metier_json)
                : row.donnees_metier_json
        };
    }
}

module.exports = new SyntheseRepository();
