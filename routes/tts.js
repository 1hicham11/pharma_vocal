const express = require('express');
const router = express.Router();
const ttsController = require('../controllers/ttsController');
const authenticateToken = require('../middleware/auth');

// GET /api/tts/voices
router.get('/voices', authenticateToken, ttsController.listVoices);

// GET /api/tts?text=...&lang=...
router.get('/', authenticateToken, ttsController.handleTTS);

module.exports = router;
