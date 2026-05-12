const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const chatController = require('../controllers/chatController');
const authenticateToken = require('../middleware/auth');

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.webm';
        cb(null, `${Date.now()}${ext}`);
    }
});

const upload = multer({ storage });

// POST /api/chat
router.post('/', authenticateToken, upload.single('audio'), chatController.handleChat);

module.exports = router;
