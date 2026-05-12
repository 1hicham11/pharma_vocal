const sessionRepository = require('../repositories/sessionRepository');
const chatRepository = require('../repositories/chatRepository');
const evaluationRepository = require('../repositories/evaluationRepository');
const medicamentRepository = require('../repositories/medicamentRepository');
const medConnuesRepository = require('../repositories/medConnuesRepository');
const medInconnuesRepository = require('../repositories/medInconnuesRepository');
const IAEvaluationStrategy = require('../strategies/IAEvaluationStrategy');

class EvaluateService {
    /**
     * @param {import('../strategies/EvaluationStrategy')} strategy
     */
    constructor(strategy = null) {
        // Si aucune stratégie injectée, utiliser IAEvaluationStrategy par défaut
        this.strategy = strategy || new IAEvaluationStrategy();
    }

    /**
     * Analyse et évalue une session (anciennement evaluateSession).
     * @param {string} sessionId
     * @returns {Promise<Object>}  résultat de l'évaluation
     */
    async analyzeConversation(sessionId) {
        const session = await sessionRepository.findById(sessionId);
        if (!session) throw new Error('Session introuvable');

        const messages = await chatRepository.getHistory(sessionId);
        if (messages.length < 2) throw new Error('Pas assez de messages');

        const medicaments = await medicamentRepository.getAllActive();
        const transcription = messages.map(m => `${m.auteur}: ${m.contenue || m.contenu}`).join('\n');

        let result;
        try {
            result = await this.strategy.calculateScore({
                transcription,
                medicaments,
                sessionId
            });
        } catch (err) {
            console.error('Erreur lors du calcul du score IA:', err.message);
            throw new Error('Échec de l\'évaluation par l\'IA. Format JSON invalide ou erreur API.');
        }

        // 1. Sauvegarder l'évaluation globale
        await evaluationRepository.save(sessionId, result);

        // 2. Traiter les médicaments connus détectés (avec score)
        if (result.medicaments_connues && Array.isArray(result.medicaments_connues)) {
            for (const med of result.medicaments_connues) {
                try {
                    const medId = typeof med === 'object' ? med.id : med;
                    const score = typeof med === 'object' ? med.score : null;
                    if (medId) {
                        await medConnuesRepository.saveLink(sessionId, medId, score);
                    }
                } catch (err) {
                    console.error(`Erreur lors de la sauvegarde du médicament connu:`, err.message);
                }
            }
        }

        // 3. Traiter les médicaments inconnus détectés (avec gestion de la casse et dédoublonnage)
        if (result.medicaments_inconnues && Array.isArray(result.medicaments_inconnues)) {
            const uniqueUnknowns = new Set(
                result.medicaments_inconnues
                    .filter(name => typeof name === 'string' && name.trim() !== '')
                    .map(name => name.toLowerCase().trim())
            );

            for (const name of uniqueUnknowns) {
                try {
                    // Vérifier si n'est pas déjà dans les connus par erreur de l'IA
                    const isKnown = medicaments.some(m => m.nom_commercial.toLowerCase() === name);
                    if (!isKnown) {
                        await medInconnuesRepository.saveUnknown(sessionId, name);
                    }
                } catch (err) {
                    console.error(`Erreur lors de la sauvegarde du médicament inconnu ${name}:`, err.message);
                }
            }
        }

        await sessionRepository.finalize(sessionId);

        return result;
    }

    /** @deprecated Utiliser analyzeConversation(sessionId) */
    async evaluateSession(sessionId) {
        return this.analyzeConversation(sessionId);
    }
}

module.exports = new EvaluateService();
