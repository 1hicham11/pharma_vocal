const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const authenticateToken = require('../middleware/auth');

// ── POST /api/agents/session ──────────────────────────────────────────────────
// Initialise une nouvelle session Multi-Agents (charge avatar MySQL)
router.post('/session', authenticateToken, (req, res) => agentController.initSession(req, res));

// ── GET /api/agents/session/:id ───────────────────────────────────────────────
// Reprend une session existante avec son historique
router.get('/session/:id', authenticateToken, (req, res) => agentController.getSession(req, res));

// ── POST /api/agents/session/:id/message ─────────────────────────────────────
// Envoie un message → pipeline RagFlow DDU + GraphRAG + LLM
router.post('/session/:id/message', authenticateToken, (req, res) => agentController.sendMessage(req, res));

// ── PUT /api/agents/session/:id/end ──────────────────────────────────────────
// Clôture la session → synthèse LLM → SYNTHESE_ASSISTANCE (Power BI)
router.put('/session/:id/end', authenticateToken, (req, res) => agentController.endSession(req, res));

module.exports = router;
