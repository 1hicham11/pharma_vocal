const appFactory = require('../factories/AppFactory');
const fs = require('fs');

class SttController {
    /**
     * POST /api/stt
     * Transcrit un fichier audio via ISttProvider (OpenAISttAdapter).
     */
    transcribe = async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier audio reçu' });
        }

        try {
            const sttProvider = appFactory.getSttProvider();
            const lang = req.body.lang || req.query.lang || 'auto';
            const transcription = await sttProvider.transcribe(
                fs.createReadStream(req.file.path),
                lang,
                req.file.originalname
            );

            // Nettoyage du fichier temporaire
            fs.unlinkSync(req.file.path);

            res.json({ text: transcription });
        } catch (err) {
            console.error('SttController.transcribe:', err.message);
            res.status(500).json({ error: 'Échec de la transcription' });
        }
    }

    /** @deprecated Alias vers transcribe() pour rétrocompatibilité des routes existantes */
    handleSTT = async (req, res) => {
        return this.transcribe(req, res);
    }
}

module.exports = new SttController();
