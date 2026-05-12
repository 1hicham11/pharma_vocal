const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

router.get('/stats', authenticateToken, dashboardController.getStats);

module.exports = router;
