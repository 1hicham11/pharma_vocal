const EvaluationStrategy = require('./EvaluationStrategy');

/**
 * AdminEvaluationStrategy
 * Stratégie d'évaluation manuelle / administrative.
 * Les scores sont fournis directement par un administrateur.
 * Implémente EvaluationStrategy.
 */
class AdminEvaluationStrategy extends EvaluationStrategy {
    /**
     * @param {Object} data
     * @param {Object} data.scores  scores saisis manuellement par l'admin
     * @returns {Promise<Object>}
     */
    async calculateScore(data) {
        const { scores } = data;

        if (!scores) {
            throw new Error('AdminEvaluationStrategy: scores manquants dans data.scores');
        }

        const {
            score_argumentation = 0,
            score_exactitude = 0,
            score_empathie = 0,
            points_forts = '',
            points_amelioration = '',
            conseil_ia = 'Évaluation administrative'
        } = scores;

        const score_num = Math.round((score_argumentation + score_exactitude + score_empathie) / 3);
        const score_global = score_num;

        let score_global_mention = 'Insuffisant';
        if (score_global >= 85) score_global_mention = 'Excellent';
        else if (score_global >= 70) score_global_mention = 'Bien';
        else if (score_global >= 50) score_global_mention = 'Passable';

        return {
            score_argumentation,
            score_exactitude,
            score_empathie,
            score_num,
            methode_calcul: 'ADMIN',
            score_global,
            score_global_mention,
            points_forts,
            points_amelioration,
            conseil_ia
        };
    }
}

module.exports = AdminEvaluationStrategy;
