// routes/sessions.js
const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const authenticateToken = require('../middleware/auth');
const isAdmin = require('../middleware/roleMiddleware');

// ─── POST /api/sessions ───────────────────────────────────────
router.post('/', authenticateToken, sessionController.createSession);

// ─── GET /api/sessions/:id ────────────────────────────────────
router.get('/:id', authenticateToken, sessionController.getSession);

// ─── GET /api/sessions ────────────────────────────────────────
router.get('/', authenticateToken, sessionController.getSessions);

// ─── GET /api/sessions/all (ADMIN) ───────────────────────────
router.get('/all', authenticateToken, isAdmin, sessionController.getAllSessions);

// ─── GET /api/sessions/:id/messages ──────────────────────────
router.get('/:id/messages', authenticateToken, sessionController.getMessages);

// ─── PUT /api/sessions/:id/end ────────────────────────────────
router.put('/:id/end', authenticateToken, sessionController.endSession);

// ─── GET /api/sessions/historique/:delegueId ───────────────────
router.get('/historique/:delegueId', authenticateToken, sessionController.getHistoryByDelegue);

// ─── GET /api/sessions/:id/evaluation ──────────────────────────
router.get('/:id/evaluation', authenticateToken, sessionController.getSessionEvaluation);

module.exports = router;
