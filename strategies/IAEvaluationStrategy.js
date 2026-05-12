const EvaluationStrategy = require('./EvaluationStrategy');
const OpenAI = require('openai');
const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

function resolveEvalModel() {
    const requestedModel = String(process.env.OPENAI_EVAL_MODEL || '').trim();
    if (!requestedModel) return 'gpt-4o-mini';
    return /(llama|mixtral|gemma|versatile|groq)/i.test(requestedModel) ? 'gpt-4o-mini' : requestedModel;
}

/**
 * IAEvaluationStrategy
 * Évalue la session via l'IA OpenAI.
 * Implémente EvaluationStrategy.
 */
class IAEvaluationStrategy extends EvaluationStrategy {
    constructor() {
        super();
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: OPENAI_API_BASE_URL,
        });
    }

    /**
     * @param {Object} data
     * @param {string} data.transcription  texte de toute la conversation
     * @param {Array}  data.medicaments    liste des médicaments actifs
     * @param {string} data.sessionId
     * @returns {Promise<Object>}
     */
    async calculateScore(data) {
        const { transcription, medicaments } = data;

        const completion = await this.openai.chat.completions.create({
            model: resolveEvalModel(),
            messages: [{
                role: 'user',
                content: `Tu es un expert en formation de délégués pharmaceutiques. 
                TON OBJECTIF : Évaluer de manière TRÈS PERSONNALISÉE la performance du DÉLÉGUÉ (l'utilisateur). 
                
                VOICI LA LISTE DES MÉDICAMENTS (CATALOGUE RAG) POUR VÉRIFIER L'EXACTITUDE :
                ${medicaments.map(m => `- ${m.nom_commercial} (${m.dci}) : Indiqué pour ${m.indication}, Posologie: ${m.posologie}`).join('\n')}

                TRANSCRIPTION DE LA DISCUSSION RÉELLE :
                ${transcription}

                CONSIGNES D'ÉVALUATION :
                1. ANALYSE TECHNIQUE : Compare ce que le délégué a dit avec le catalogue ci-dessus. Cite précisément ses erreurs d'indication ou de posologie.
                2. POSTURE : Évalue le respect du vouvoiement et la réaction face au Docteur Berrada (qui est sarcastique).
                3. PERSONNALISATION : Tes rubriques "points_forts", "points_amelioration" et "conseil_ia" DOIVENT citer des extraits de la transcription.

                Format JSON strict (sans texte autour) :
                {
                  "score_argumentation": number (0-100),
                  "score_exactitude": number (0-100),
                  "score_empathie": number (0-100),
                  "score_num": number,
                  "methode_calcul": "IA_ONLY",
                  "score_global": number,
                  "score_global_mention": "Excellent" | "Bien" | "Passable" | "Insuffisant",
                  "points_forts": "Citations précises du succès",
                  "points_amelioration": "Citations précises des erreurs (ex: mauvaise posologie, tutoiement)",
                  "conseil_ia": "Conseil basé sur un moment spécifique",
                  "medicaments_connues": [{ "id": number, "score": number }],
                "medicaments_inconnues": ["Extraits cités par erreur"]
                }`
            }],
            temperature: 0.1,
            response_format: { type: 'json_object' }
        });

        const raw = completion.choices[0]?.message?.content || '{}';
        return JSON.parse(raw);
    }
}

module.exports = IAEvaluationStrategy;
