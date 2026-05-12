const appFactory = require('../factories/AppFactory');
const sessionRepository = require('../repositories/sessionRepository');

class TtsController {
    resolveVoiceId = async (req) => {
        const explicitVoiceId = String(req.query?.voice_id || req.query?.voiceId || '').trim();
        if (explicitVoiceId) return explicitVoiceId;

        const avatarId = Number(req.query?.avatar_id || req.query?.avatarId || 0);
        if (!Number.isFinite(avatarId) || avatarId <= 0 || !req.user?.id) return null;

        try {
            const avatar = await sessionRepository.getAvatarById(avatarId, req.user.id);
            return avatar?.vocal_id ? String(avatar.vocal_id).trim() : null;
        } catch (err) {
            console.warn('[TtsController] Impossible de résoudre vocal_id avatar:', err.message);
            return null;
        }
    }

    /**
     * GET /api/tts?text=...&lang=...
     * Génère un flux audio via ITtsProvider.
     */
    generateStream = async (req, res) => {
        const { text, lang } = req.query;

        if (!text) {
            return res.status(400).json({ error: 'Texte requis' });
        }

        res.set({
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Transfer-Encoding': 'chunked'
        });

        let closed = false;
        res.on('close', () => { 
            closed = true;
            console.log('[TtsController] Connexion fermée par le client');
        });

        try {
            console.log(`[TtsController] ▶ DÉBUT synthèse pour: "${text.substring(0, 50)}..."`);
            const startTime = Date.now();
            const voiceId = await this.resolveVoiceId(req);

            // Si l'agent a une voix ElevenLabs choisie, on bascule sur ElevenLabs.
            // Sinon on garde le provider par défaut (OpenAI, sauf si TTS_PROVIDER force autre chose).
            let ttsProvider = appFactory.getTtsProvider();
            if (voiceId) {
                const elevenProvider = appFactory.getElevenLabsTtsProvider();
                if (elevenProvider) {
                    ttsProvider = elevenProvider;
                    console.log(`[TtsController] Provider dynamique: ElevenLabs (voiceId=${voiceId})`);
                } else {
                    console.warn('[TtsController] vocal_id présent mais ElevenLabs indisponible — fallback provider par défaut.');
                }
            }

            // On nettoie le texte de l'IA avant de le vocaliser
            const textePropre = text
                .replace(/[*#_]/g, '') // Enlève le gras et l'italique Markdown
                .replace(/[\u{1F600}-\u{1FFFF}]/gu, '') // Enlève les Emojis
                .trim();

            const stream = ttsProvider.streamSpeech(textePropre, lang || 'auto', { voiceId });

            let chunkCount = 0;
            let totalBytes = 0;

            try {
                for await (const chunk of stream) {
                    if (closed) {
                        console.log('[TtsController] ⏹ Connexion fermée, arrêt du stream');
                        break;
                    }
                    res.write(chunk);
                    chunkCount++;
                    totalBytes += chunk.length;
                    console.log(`[TtsController] 📦 Chunk #${chunkCount}: ${chunk.length} bytes (total: ${totalBytes} bytes)`);
                }

                if (!closed) {
                    const duration = Date.now() - startTime;
                    console.log(`[TtsController] ✅ Synthèse terminée | ${chunkCount} chunks | ${totalBytes} bytes | ${duration}ms`);
                    res.end();
                }
            } catch (streamErr) {
                console.error('[TtsController] ❌ Erreur pendant la lecture du flux:', streamErr.message);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Erreur lors du traitement du flux audio' });
                } else if (!closed) {
                    res.end();
                }
            }
        } catch (err) {
            console.error('[TtsController] ❌ generateStream Error:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Échec de la synthèse vocale' });
            } else if (!closed) {
                res.end();
            }
        }
    }

    /** @deprecated Alias vers generateStream() pour rétrocompatibilité des routes existantes */
    handleTTS = async (req, res) => {
        return this.generateStream(req, res);
    }

    listVoices = async (_req, res) => {
        try {
            const ttsProvider = appFactory.getElevenLabsTtsProvider();
            if (!ttsProvider) {
                return res.status(400).json({
                    error: 'ElevenLabs non configuré : définissez ELEVENLABS_API_KEY dans .env.'
                });
            }

            const voices = await ttsProvider.listVoices();
            res.json({ voices });
        } catch (err) {
            console.error('[TtsController] listVoices:', err.message);
            res.status(500).json({ error: err.message || 'Impossible de récupérer les voix ElevenLabs' });
        }
    }
}

module.exports = new TtsController();
