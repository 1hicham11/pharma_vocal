const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const adminController = require('../controllers/adminController');
const authenticateToken = require('../middleware/auth');

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, path.join(__dirname, '..', 'tmp')); },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    },
});
const upload = multer({ storage });

// Experts
router.get('/avatars', authenticateToken, adminController.getAvatars);
router.post('/avatars', authenticateToken, adminController.createAvatar);
router.put('/avatars/:id', authenticateToken, adminController.updateAvatar);
router.delete('/avatars/:id', authenticateToken, adminController.deleteAvatar);
router.post('/avatars/:id/mascot/candidates', authenticateToken, adminController.generateAvatarMascotCandidates);
router.get('/avatars/:id/mascot/candidates/status', authenticateToken, adminController.getMascotCandidatesStatus);
router.post('/avatars/:id/mascot/generate', authenticateToken, adminController.generateAvatarMascot);
router.get('/avatars/:id/mascot/status', authenticateToken, adminController.getMascotStatus);
router.post('/mascot/preview/candidates', authenticateToken, adminController.generateMascotPreviewCandidates);
router.get('/mascot/preview/candidates/:previewId/status', authenticateToken, adminController.getMascotPreviewCandidatesStatus);
router.post('/mascot/preview/generate', authenticateToken, adminController.generateMascotPreview);
router.get('/mascot/preview/:previewId/status', authenticateToken, adminController.getMascotPreviewStatus);

// RAG
router.post('/rag/upload', authenticateToken, upload.single('file'), adminController.uploadRagDocument);
router.get('/rag/documents', authenticateToken, adminController.listRagDocuments);
router.delete('/rag/documents/:id', authenticateToken, adminController.deleteRagDocument);

// Excel
router.post('/excel/upload', authenticateToken, upload.single('file'), adminController.uploadExcelFile);

module.exports = router;
