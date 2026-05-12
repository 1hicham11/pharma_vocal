const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const messageAssistanceRepository = require('../repositories/messageAssistanceRepository');
const assistanceSessionRepository = require('../repositories/assistanceSessionRepository');
const syntheseRepository = require('../repositories/syntheseRepository');
const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

function resolveSynthModel() {
    const requestedModel = String(process.env.OPENAI_SYNTH_MODEL || '').trim();
    if (!requestedModel) return 'gpt-4o-mini';
    return /(llama|mixtral|gemma|versatile|groq)/i.test(requestedModel) ? 'gpt-4o-mini' : requestedModel;
}

/**
 * SyntheseService – Clôture de Session & Extraction de KPIs (Power BI)
 * 
 * Pipeline de clôture :
 *   1. Récupère l'historique complet en SQL (MESSAGES)
 *   2. Appel LLM → résumé + données structurées JSON adaptées au métier
 *   3. Insert dans SYNTHESE_ASSISTANCE
 *   4. Finalise la session (statut → 'terminee')
 */
class SyntheseService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: OPENAI_API_BASE_URL,
        });
    }


    // ─────────────────────────────────────────────────────────────────────────
    // CLÔTURE COMPLÈTE D'UNE SESSION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Orchestre la clôture complète d'une session.
     * @param {{ sessionId: string, avatarNom?: string }} params
     * @returns {Promise<{
     *   syntheseId          : string,
     *   resume_intervention : string,
     *   succes_aide         : boolean,
     *   donnees_metier_json : Object
     * }>}
     */
    async clotureSession({ sessionId, avatarNom = 'Agent' }) {
        console.log(`[Synthèse] Début clôture session : ${sessionId}`);

        // ── Étape 1 : Récupération de l'historique complet ───────────────────
        const messages = await messageAssistanceRepository.getHistory(sessionId);

        if (messages.length === 0) {
            // Session vide – synthèse minimale
            return this._syntheseVide(sessionId);
        }

        // ── Étape 2 : Formatage de la conversation pour le LLM ───────────────
        const conversationText = this._formatConversation(messages);
        const nbMessages = messages.length;
        const dureeEstimee = this._estimateDuration(messages);

        // ── Étape 3 : Appel LLM pour synthèse structurée ────────────────────
        const llmResult = await this._callLLMSynthese(conversationText, avatarNom, nbMessages);

        // ── Étape 4 : Insertion dans SYNTHESE_ASSISTANCE ─────────────────────
        const syntheseId = uuidv4();
        await syntheseRepository.create({
            id: syntheseId,
            session_id: sessionId,
            resume_intervention: llmResult.resume_intervention,
            succes_aide: llmResult.succes_aide,
            donnees_metier_json: {
                ...llmResult.donnees_metier,
                meta: {
                    nb_messages: nbMessages,
                    duree_estimee_min: dureeEstimee,
                    agent: avatarNom,
                    genere_par: 'SyntheseService v2',
                    timestamp: new Date().toISOString(),
                },
            },
        });

        // ── Étape 5 : Finaliser la session ────────────────────────────────────
        await assistanceSessionRepository.finalize(sessionId);

        console.log(`[Synthèse] Session ${sessionId} clôturée | SyntheseId: ${syntheseId}`);

        return {
            syntheseId,
            resume_intervention: llmResult.resume_intervention,
            succes_aide: llmResult.succes_aide,
            donnees_metier_json: llmResult.donnees_metier,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // APPEL LLM – GÉNÉRATION DE LA SYNTHÈSE STRUCTURÉE
    // ─────────────────────────────────────────────────────────────────────────

    async _callLLMSynthese(conversationText, avatarNom, nbMessages) {
        const systemPrompt = `Tu es un analyste expert en sessions d'assistance vocale pharmaceutique.
Tu reçois la transcription complète d'une session entre un utilisateur et l'agent "${avatarNom}".
Tu dois retourner UNIQUEMENT un objet JSON valide (sans markdown, sans texte autour) avec exactement cette structure :

{
  "resume_intervention": "Résumé clair et concis de la session en 3-5 phrases.",
  "succes_aide": true,
  "donnees_metier": {
    "medicaments_abordes": ["liste des médicaments mentionnés"],
    "pathologies_ciblees": ["liste des pathologies abordées"],
    "dci_mentionnees": ["liste des DCI mentionnées"],
    "actions_agents": ["liste des actions ou recommandations émises par l'agent"],
    "score_confiance_utilisateur": 0.75,
    "points_forts": ["point 1", "point 2"],
    "points_amelioration": ["axe 1", "axe 2"],
    "niveau_expertise_estime": "débutant|intermédiaire|expert",
    "sujets_abordes": ["sujet 1", "sujet 2"],
    "nb_questions_posees": 3,
    "satisfaction_estimee": "élevée|moyenne|faible"
  }
}

Règles :
- succes_aide = true si l'agent a pu répondre aux besoins, false sinon.
- score_confiance_utilisateur entre 0 et 1.
- Toujours retourner du JSON valide, jamais de texte libre.`;

        const userPrompt = `Session de ${nbMessages} messages avec l'agent "${avatarNom}".

TRANSCRIPTION COMPLÈTE :
${conversationText}

Génère la synthèse JSON maintenant.`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: resolveSynthModel(),
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.3,  // Faible pour un output JSON fiable
                max_tokens: 1200,
                response_format: { type: 'json_object' },
            });

            const raw = completion.choices[0]?.message?.content || '{}';
            // Nettoyer d'éventuels backticks markdown
            const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);

            return {
                resume_intervention: parsed.resume_intervention || 'Session enregistrée.',
                succes_aide: Boolean(parsed.succes_aide),
                donnees_metier: parsed.donnees_metier || {},
            };

        } catch (err) {
            console.error('[Synthèse] Erreur LLM ou parsing JSON :', err.message);
            // Synthèse de secours si le LLM échoue
            return {
                resume_intervention: `Session terminée avec ${nbMessages} échanges. Analyse automatique indisponible.`,
                succes_aide: true,
                donnees_metier: { nb_messages: nbMessages, erreur_synthese: err.message },
            };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    _formatConversation(messages) {
        return messages.map(m => {
            const auteur = m.auteur === 'utilisateur' ? '👤 UTILISATEUR' : '🤖 AGENT';
            const heure = new Date(m.date_envoi).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            return `[${heure}] ${auteur} : ${m.transcription_texte}`;
        }).join('\n');
    }

    _estimateDuration(messages) {
        if (messages.length < 2) return 0;
        const debut = new Date(messages[0].date_envoi);
        const fin = new Date(messages[messages.length - 1].date_envoi);
        return Math.round((fin - debut) / 60000); // en minutes
    }

    async _syntheseVide(sessionId) {
        const syntheseId = uuidv4();
        await syntheseRepository.create({
            id: syntheseId,
            session_id: sessionId,
            resume_intervention: 'Session terminée sans échange.',
            succes_aide: false,
            donnees_metier_json: { nb_messages: 0, note: 'Session vide' },
        });
        await assistanceSessionRepository.finalize(sessionId);
        return {
            syntheseId,
            resume_intervention: 'Session terminée sans échange.',
            succes_aide: false,
            donnees_metier_json: {},
        };
    }
}

module.exports = new SyntheseService();
