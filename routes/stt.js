const express = require('express');
const router = express.Router();
const multer = require('multer');
const sttController = require('../controllers/sttController');
const path = require('path');
const fs = require('fs');

// Dossier temporaire pour les audios
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
        cb(null, Date.now() + ext);
    }
});

const upload = multer({ storage: storage });

// POST /api/stt
router.post('/', upload.single('audio'), sttController.handleSTT);

module.exports = router;
