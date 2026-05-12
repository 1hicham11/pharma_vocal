const evaluateService = require('../services/evaluateService');

class EvaluateController {
    /**
     * POST /api/evaluate
     * Lance l'analyse et l'évaluation de la session via EvaluateService.
     */
    evaluateSession = async (req, res) => {
        const { session_id } = req.body;
        if (!session_id) return res.status(400).json({ error: 'session_id requis' });

        try {
            // analyzeConversation() est le nom selon le diagramme de classe
            const evaluation = await evaluateService.analyzeConversation(session_id);
            res.json({ success: true, evaluation });
        } catch (err) {
            console.error('EvaluateController:', err.message);
            res.status(500).json({ error: err.message });
        }
    }

    /** Alias – compatible avec handleEvaluation() si utilisé dans des routes existantes */
    handleEvaluation = async (req, res) => {
        return this.evaluateSession(req, res);
    }
}

module.exports = new EvaluateController();
