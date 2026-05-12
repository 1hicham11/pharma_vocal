const avatarRepository = require('../repositories/avatarRepository');
const assistanceSessionRepository = require('../repositories/assistanceSessionRepository');
const { v4: uuidv4 } = require('uuid');

/**
 * AgentInitService – Initialisation Dynamique d'une Session Multi-Agent
 * 
 * Charge la configuration de l'agent depuis MySQL (AVATARS_ASSISTANTS)
 * et crée une session V2 dans SESSIONS_ASSISTANCE.
 * 
 * Retourne tout ce dont l'orchestrateur a besoin pour traiter les messages.
 */
class AgentInitService {

    /**
     * Initialise une nouvelle session pour l'agent choisi.
     * @param {{ avatarId: number, userId: string }} params
     * @returns {Promise<{
     *   sessionId      : string,
     *   avatarId       : number,
     *   nomAvatar      : string,
     *   systemPrompt   : string,
     *   ragflowDatasetId: string|null,
     *   vocalId        : string|null,
     * }>}
     */
    async initSession({ avatarId, userId }) {
        // ── 1. Charger l'avatar depuis MySQL ─────────────────────────────────
        const avatar = await avatarRepository.findById(avatarId);
        if (!avatar) {
            const err = new Error(`Avatar introuvable (id=${avatarId})`);
            err.status = 404;
            throw err;
        }

        // ── 2. Générer un UUID de session côté Node.js ────────────────────────
        const sessionId = uuidv4();

        // ── 3. Créer la session dans SESSIONS_ASSISTANCE ──────────────────────
        await assistanceSessionRepository.create({
            id: sessionId,
            user_id: userId,
            avatar_id: avatarId,
        });

        console.log(`[AgentInit] Session créée : ${sessionId} | Agent : ${avatar.nom_avatar}`);

        // ── 4. Retourner la configuration complète ────────────────────────────
        return {
            sessionId,
            avatarId: avatar.id,
            nomAvatar: avatar.nom_avatar,
            systemPrompt: avatar.prompt_systeme,
            ragflowDatasetId: avatar.ragflow_dataset_id || null,
            vocalId: avatar.vocal_id || null,
        };
    }

    /**
     * Reprend une session existante (reconnexion après coupure réseau).
     * @param {string} sessionId
     * @returns {Promise<Object>} config de session complète
     */
    async resumeSession(sessionId) {
        const session = await assistanceSessionRepository.findById(sessionId);
        if (!session) {
            const err = new Error(`Session introuvable (id=${sessionId})`);
            err.status = 404;
            throw err;
        }
        if (session.statut === 'terminee') {
            const err = new Error(`Session déjà terminée (id=${sessionId})`);
            err.status = 409;
            throw err;
        }
        return {
            sessionId: session.id,
            avatarId: session.avatar_id,
            nomAvatar: session.nom_avatar,
            systemPrompt: session.prompt_systeme,
            ragflowDatasetId: session.ragflow_dataset_id || null,
            vocalId: session.vocal_id || null,
        };
    }
}

module.exports = new AgentInitService();
