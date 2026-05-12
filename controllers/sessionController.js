const sessionService = require('../services/sessionService');
const StartSessionDTO = require('../dtos/StartSessionDTO');

class SessionController {
    async createSession(req, res) {
        try {
            // En mode démo, il est possible que req.user soit absent (login local).
            const userId = req.user?.id || req.body.userId || null;
            const dto = StartSessionDTO.fromRequest(userId, req.body);
            const sessionId = await sessionService.createSession(dto);
            res.status(201).json({ session_id: sessionId, status: 'ok' });
        } catch (err) {
            console.error('SessionController.createSession:', err);
            if (err.code === 'USER_NOT_FOUND') {
                return res.status(400).json({ error: 'Utilisateur introuvable pour cette session. Reconnectez-vous.' });
            }
            res.status(500).json({ error: 'Erreur lors de la création de la session' });
        }
    }

    async getSession(req, res) {
        try {
            const session = await sessionService.getSessionById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session non trouvée' });
            res.json(session);
        } catch (err) {
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    async getSessions(req, res) {
        try {
            const persona = req.query.persona || null;
            const avatarRaw = req.query.avatar_id;
            const avatarParsed = avatarRaw != null && String(avatarRaw).trim() !== '' ? Number(avatarRaw) : NaN;
            const avatarId = Number.isFinite(avatarParsed) ? avatarParsed : null;
            const sessions = await sessionService.getUserSessions(req.user.id, persona, avatarId);
            res.json(sessions);
        } catch (err) {
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    async getMessages(req, res) {
        try {
            const messages = await sessionService.getSessionMessages(req.params.id);
            if (!messages) return res.status(403).json({ error: 'Accès refusé' });
            res.json(messages);
        } catch (err) {
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    async endSession(req, res) {
        try {
            await sessionService.finishSession(req.params.id);
            res.json({ status: 'success' });
        } catch (err) {
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    async getHistoryByDelegue(req, res) {
        try {
            const sessions = await sessionService.getUserSessions(req.params.delegueId);
            res.json(sessions);
        } catch (err) {
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    async getSessionEvaluation(req, res) {
        try {
            let evaluation = await sessionService.getSessionEvaluation(req.params.id);

            // Si l'évaluation n'existe pas encore (ex: premier accès aux résultats), on la déclenche
            if (!evaluation) {
                const evaluateService = require('../services/evaluateService');
                try {
                    evaluation = await evaluateService.analyzeConversation(req.params.id);
                } catch (err) {
                    console.error('SessionController.getSessionEvaluation [Auto-Eval]:', err.message);
                    return res.status(404).json({ error: 'Évaluation non trouvée' });
                }
            }

            res.json(evaluation);
        } catch (err) {
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    async getAllSessions(req, res) {
        const sessionRepository = require('../repositories/sessionRepository');
        try {
            const sessions = await sessionRepository.findAll();
            res.json(sessions);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new SessionController();
