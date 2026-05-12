const agentInitService = require('../services/agentInitService');
const agentOrchestrator = require('../services/agentOrchestrator');
const syntheseService = require('../services/syntheseService');
const messageAssistanceRepository = require('../repositories/messageAssistanceRepository');
const assistanceSessionRepository = require('../repositories/assistanceSessionRepository');

/**
 * AgentController – Contrôleur Multi-Agents V2
 * 
 * Routes gérées :
 *   POST   /api/agents/session           → initSession
 *   GET    /api/agents/session/:id       → getSession
 *   POST   /api/agents/session/:id/message → sendMessage
 *   PUT    /api/agents/session/:id/end   → endSession
 */
class AgentController {

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/agents/session
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Initialise une nouvelle session Multi-Agent.
     * Body : { avatarId: number, userId?: string }
     */
    async initSession(req, res) {
        try {
            const { avatarId } = req.body;
            // userId depuis le JWT si dispo, sinon depuis le body
            const userId = req.user?.id || req.body.userId;

            if (!avatarId) {
                return res.status(400).json({ error: '`avatarId` est requis.' });
            }
            if (!userId) {
                return res.status(400).json({ error: '`userId` est requis (ou connectez-vous).' });
            }

            const config = await agentInitService.initSession({ avatarId, userId });

            return res.status(201).json({
                message: `Session initialisée avec l'agent "${config.nomAvatar}"`,
                sessionId: config.sessionId,
                avatarId: config.avatarId,
                nomAvatar: config.nomAvatar,
                vocalId: config.vocalId,
                // On n'expose PAS le prompt système au client pour des raisons de sécurité
            });

        } catch (err) {
            console.error('[AgentController] initSession :', err.message);
            return res.status(err.status || 500).json({ error: err.message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/agents/session/:id
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Reprend une session existante (reconnexion).
     */
    async getSession(req, res) {
        try {
            const config = await agentInitService.resumeSession(req.params.id);
            const history = await messageAssistanceRepository.getHistory(req.params.id);

            return res.json({
                ...config,
                history: history.map(m => ({
                    auteur: m.auteur,
                    texte: m.transcription_texte,
                    date: m.date_envoi,
                })),
            });
        } catch (err) {
            console.error('[AgentController] getSession :', err.message);
            return res.status(err.status || 500).json({ error: err.message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/agents/session/:id/message
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Envoie un message au pipeline Multi-Agent (RagFlow DDU + GraphRAG + LLM).
     * Body : { message: string }
     */
    async sendMessage(req, res) {
        try {
            const sessionId = req.params.id;
            const userText = req.body.message;

            if (!userText?.trim()) {
                return res.status(400).json({ error: '`message` est requis.' });
            }

            // Charger la config de session depuis MySQL (prompt + datasetId)
            const session = await assistanceSessionRepository.findById(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session introuvable.' });
            }
            if (session.statut === 'terminee') {
                return res.status(409).json({ error: 'Session déjà terminée.' });
            }

            // Charger l'historique pour le contexte LLM
            const history = await messageAssistanceRepository.getHistory(sessionId);

            // Pipeline complet Agent Autonome
            const result = await agentOrchestrator.processMessage({
                sessionId,
                userText,
                systemPrompt: session.prompt_systeme,
                avatarId: session.avatar_id,
                ragflowDatasetId: session.ragflow_dataset_id,
                history: history.slice(-10), // fenêtre des 10 derniers messages
            });

            return res.json({
                response: result.responseText,
                sources: result.sources,
                graphContext: result.graphContext,
                actions: result.actions,
            });

        } catch (err) {
            console.error('[AgentController] sendMessage :', err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUT /api/agents/session/:id/end
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Clôture la session : génère la synthèse LLM + insère dans SYNTHESE_ASSISTANCE.
     */
    async endSession(req, res) {
        try {
            const sessionId = req.params.id;

            const session = await assistanceSessionRepository.findById(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session introuvable.' });
            }
            if (session.statut === 'terminee') {
                return res.status(409).json({ error: 'Session déjà clôturée.' });
            }

            const synthese = await syntheseService.clotureSession({
                sessionId,
                avatarNom: session.nom_avatar,
            });

            return res.json({
                message: '✅ Session clôturée avec succès.',
                synthese: {
                    id: synthese.syntheseId,
                    resume: synthese.resume_intervention,
                    succes: synthese.succes_aide,
                    kpis: synthese.donnees_metier_json,
                },
            });

        } catch (err) {
            console.error('[AgentController] endSession :', err.message);
            return res.status(err.status || 500).json({ error: err.message });
        }
    }
}

module.exports = new AgentController();
