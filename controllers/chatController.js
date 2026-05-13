const chatService = require('../services/chatService');
const chatRepository = require('../repositories/chatRepository');
const ChatMessageDTO = require('../dtos/ChatMessageDTO');
const appFactory = require('../factories/AppFactory');
const messageAssistanceRepository = require('../repositories/messageAssistanceRepository');
const fs = require('fs');

class ChatController {
    async handleChat(req, res) {
        const startedAt = Date.now();
        const dto = ChatMessageDTO.fromRequest(req.body, req.file || null);
        const hasAudioFile = Boolean(req.file && req.file.path);
        const wantsStream = ['1', 'true', 'yes'].includes(String(req.query?.stream || '').toLowerCase());
        try {
            if (!dto.sessionId) {
                return res.status(400).json({ error: 'session_id requis' });
            }

            if (!dto.message && hasAudioFile) {
                const sttProvider = appFactory.getSttProvider();
                const language = req.body?.language || 'auto';
                dto.message = await sttProvider.transcribe(
                    fs.createReadStream(req.file.path),
                    language,
                    req.file.originalname || 'audio.webm'
                );
                dto.message = dto.message && String(dto.message).trim() ? String(dto.message).trim() : null;
                console.info(`[ChatController] STT done in ${Date.now() - startedAt}ms`);
            }

            if (!dto.message) {
                if (hasAudioFile) {
                    return res.status(400).json({
                        error: 'Transcription vide — parlez plus fort, rapprochez le micro, ou vérifiez la clé STT (OpenAI).'
                    });
                }
                if (req.is && req.is('multipart/*')) {
                    return res.status(400).json({
                        error:
                            'Aucun fichier audio reçu — le champ multipart doit s’appeler exactement « audio » et inclure un nom de fichier.'
                    });
                }
                return res.status(400).json({ error: 'message ou audio requis' });
            }

            // For multipart audio requests (session.html), return standard JSON by default.
            // If ?stream=1 is provided, stream token-by-token as SSE.
            if (hasAudioFile && !wantsStream) {
                const stream = await chatService.processMessageStream(dto);
                let fullResponse = '';
                for await (const chunk of stream) {
                    fullResponse += chunk.choices[0]?.delta?.content || '';
                }

                const messageCount = await messageAssistanceRepository.countBySession(dto.sessionId);
                return res.json({
                    reply: fullResponse,
                    transcript: dto.message,
                    nb_exchanges: Math.floor(Number(messageCount || 0) / 2)
                });
            }

            res.set({
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            let closed = false;
            res.on('close', () => { closed = true; });

            if (hasAudioFile) {
                res.write(`data: ${JSON.stringify({ transcript: dto.message })}\n\n`);
                if (typeof res.flush === 'function') res.flush();
            }

            const stream = await chatService.processMessageStream(dto);
            let fullResponse = '';
            let firstTokenLogged = false;

            for await (const chunk of stream) {
                if (closed) break;
                const token = chunk.choices[0]?.delta?.content || '';
                if (token) {
                    if (!firstTokenLogged) {
                        firstTokenLogged = true;
                        console.info(`[ChatController] first SSE token in ${Date.now() - startedAt}ms`);
                    }
                    fullResponse += token;
                    res.write(`data: ${JSON.stringify({ token })}\n\n`);
                    if (typeof res.flush === 'function') res.flush();
                }
            }

            if (!closed) {
                res.write(`data: ${JSON.stringify({
                    stream_done: true,
                    reply: fullResponse
                })}\n\n`);
                res.write(`data: [DONE]\n\n`);
                res.end();
            }
        } catch (err) {
            console.error('ChatController.handleChat:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erreur streaming chat' });
            } else {
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                res.end();
            }
        } finally {
            if (hasAudioFile && req.file?.path) {
                fs.unlink(req.file.path, () => {});
            }
        }
    }
}

module.exports = new ChatController();
