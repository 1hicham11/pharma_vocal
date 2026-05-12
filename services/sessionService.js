const sessionRepository = require('../repositories/sessionRepository');
const { v4: uuidv4 } = require('uuid');

class SessionService {
    /**
     * Crée une nouvelle session de chat pour un expert
     * @param {Object} dto - Contient delegueId, persona (nom) ou avatarId
     */
    async createSession(dto) {
        const sessionId = uuidv4();

        // 1. Déterminer quel expert utiliser (ID ou Nom)
        let avatarId = dto.avatarId;
        
        if (!avatarId && dto.persona) {
            // Si on n'a que le nom, on cherche l'ID via le repository
            avatarId = await sessionRepository.getOrCreateAvatarByPersona(dto.persona);
        }

        if (!avatarId) {
            throw new Error("Impossible d'identifier l'expert pour cette session.");
        }

        // 2. Création de la session en base de données
        await sessionRepository.create({
            id: sessionId,
            user_id: dto.delegueId,
            avatar_id: avatarId
        });

        return sessionId;
    }

    async getSessionById(sessionId) {
        return await sessionRepository.findById(sessionId);
    }

    async getUserSessions(delegueId, personaName = null, avatarId = null) {
        return await sessionRepository.findByDelegueId(delegueId, personaName, avatarId);
    }

    async getSessionMessages(sessionId) {
        const messageAssistanceRepository = require('../repositories/messageAssistanceRepository');
        return await messageAssistanceRepository.getHistory(sessionId);
    }

    async finishSession(sessionId) {
        await sessionRepository.finalize(sessionId);
        return true;
    }

    async getSessionEvaluation(sessionId) {
        const evaluationRepository = require('../repositories/evaluationRepository');
        return await evaluationRepository.findBySessionId(sessionId);
    }
}

module.exports = new SessionService();