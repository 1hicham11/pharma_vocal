/**
 * Interface / Classe abstraite – EvaluationStrategy
 * Toutes les stratégies d'évaluation doivent implémenter cette interface.
 */
class EvaluationStrategy {
    /**
     * Calcule les scores de la conversation.
     * @param {Object} data  { transcription: string, medicaments: array, sessionId: string }
     * @returns {Promise<Object>}  résultat d'évaluation
     */
    async calculateScore(data) {
        throw new Error(`${this.constructor.name} doit implémenter calculateScore()`);
    }
}

module.exports = EvaluationStrategy;
