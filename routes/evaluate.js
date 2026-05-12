const express = require('express');
const router = express.Router();
const evaluateController = require('../controllers/evaluateController');
const authenticateToken = require('../middleware/auth');

// POST /api/evaluate
router.post('/', authenticateToken, evaluateController.handleEvaluation);

module.exports = router;
