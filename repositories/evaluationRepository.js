const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

class EvaluationRepository extends BaseRepository {
    constructor() {
        super(pool, 'evaluation');
    }

    /**
     * Insère ou met à jour une évaluation.
     * @param {Object} data  { session_id, ...scores }
     */
    async create(data) {
        return await this.save(data.session_id, data);
    }

    async save(sessionId, result) {
        const {
            score_argumentation,
            score_exactitude,
            score_empathie,
            score_num,
            methode_calcul,
            score_global,
            score_global_mention,
            points_forts,
            points_amelioration,
            conseil_ia
        } = result;

        await this.pool.query(
            `INSERT INTO evaluation (
                session_id, score_argumentation, score_exactitude, score_empathie, 
                score_num, methode_calcul, score_global, score_global_mention, 
                points_forts, points_amelioration, conseil_ia
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
                score_argumentation=VALUES(score_argumentation),
                score_exactitude=VALUES(score_exactitude),
                score_empathie=VALUES(score_empathie),
                score_num=VALUES(score_num),
                methode_calcul=VALUES(methode_calcul),
                score_global=VALUES(score_global),
                score_global_mention=VALUES(score_global_mention),
                points_forts=VALUES(points_forts),
                points_amelioration=VALUES(points_amelioration),
                conseil_ia=VALUES(conseil_ia)`,
            [
                sessionId, score_argumentation, score_exactitude, score_empathie,
                score_num, methode_calcul, score_global, score_global_mention,
                points_forts, points_amelioration, conseil_ia
            ]
        );
    }

    async findBySessionId(sessionId) {
        const [rows] = await this.pool.query(
            'SELECT * FROM evaluation WHERE session_id = ?',
            [sessionId]
        );
        return rows[0];
    }
}

module.exports = new EvaluationRepository();
