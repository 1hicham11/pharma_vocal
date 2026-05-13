const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const sessionRepository = require('../repositories/sessionRepository');
const messageAssistanceRepository = require('../repositories/messageAssistanceRepository');
const chatService = require('../services/chatService');

function getRealtimeModel() {
    const model = String(process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime').trim();
    if (!model || /preview/i.test(model)) return 'gpt-realtime';
    return model;
}

function getRealtimeVoice() {
    return String(process.env.OPENAI_REALTIME_VOICE || 'marin').trim();
}

function buildRealtimeSessionConfig(session, opts = {}) {
    const manual = Boolean(opts.manual);
    const turnDetection = manual
        ? null
        : {
              type: 'server_vad',
              threshold: Number(process.env.OPENAI_REALTIME_VAD_THRESHOLD || 0.5),
              prefix_padding_ms: Number(process.env.OPENAI_REALTIME_PREFIX_PADDING_MS || 300),
              silence_duration_ms: Number(process.env.OPENAI_REALTIME_SILENCE_MS || 500),
          };
    return {
        type: 'realtime',
        model: getRealtimeModel(),
        instructions: buildRealtimeInstructions(session, { manual }),
        audio: {
            output: {
                voice: getRealtimeVoice(),
            },
            input: {
                transcription: {
                    model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
                },
                turn_detection: turnDetection,
            },
        },
        output_modalities: ['audio'],
        tools: getRealtimeTools(),
        tool_choice: 'auto',
        max_output_tokens: process.env.OPENAI_REALTIME_MAX_TOKENS ? Number(process.env.OPENAI_REALTIME_MAX_TOKENS) : 'inf',
    };
}

function buildRealtimeInstructions(session, opts = {}) {
    const manual = Boolean(opts.manual);
    const agentName = session?.nom_avatar || 'Expert';
    const agentPrompt = session?.prompt_systeme || 'Tu es un assistant vocal professionnel.';
    const base = [
        `Tu es "${agentName}". Oublie que tu es une IA.`,
        `Instructions de l'agent: ${agentPrompt}`,
        '',
        'Ressources agent:',
        "- Avant de répondre à une question factuelle, métier, documentaire, produit, stock, prix, procédure ou question qui peut dépendre des ressources de l'agent, appelle l'outil lookup_agent_context.",
        "- Si l'outil retourne strict_reply, réponds exactement avec ce texte.",
        "- Si l'outil retourne un contexte, utilise ce contexte en priorité et respecte ses instructions.",
        "- Si la question est une salutation simple ou une relance conversationnelle évidente, tu peux répondre directement.",
        '',
    ];
    if (manual) {
        return base.concat([
            'Mode vocal manuel (message unique):',
            "- L'utilisateur envoie un seul enregistrement audio à la fois, après validation explicite.",
            '- Réponds directement, naturellement.',
            "- Réponse courte: 1 phrase par défaut, 2 seulement si nécessaire.",
            '- Maximum 35 mots.',
            '- Ne fais pas de markdown, pas de listes, pas de titres.',
            "- Réponds dans la même langue que l'utilisateur.",
        ]).join('\n');
    }
    return base.concat([
        'Mode vocal mains libres:',
        '- Réponds directement, naturellement et rapidement.',
        "- Réponse courte: 1 phrase par défaut, 2 seulement si nécessaire.",
        '- Maximum 35 mots.',
        '- Ne fais pas de markdown, pas de listes, pas de titres.',
        "- Réponds dans la même langue que l'utilisateur.",
    ]).join('\n');
}

function getRealtimeTools() {
    return [
        {
            type: 'function',
            name: 'lookup_agent_context',
            description: "Récupère les ressources RAG, base de données Excel et règles knowledge de l'agent pour répondre fidèlement à la question utilisateur.",
            parameters: {
                type: 'object',
                properties: {
                    question: {
                        type: 'string',
                        description: "Question ou intention de l'utilisateur à vérifier dans les ressources de l'agent.",
                    },
                },
                required: ['question'],
            },
        },
    ];
}

// POST /api/realtime/session
router.post('/session', authenticateToken, async (req, res) => {
    try {
        const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
        if (!apiKey) {
            return res.status(500).json({ error: 'OPENAI_API_KEY manquante' });
        }

        const sessionId = String(req.body?.session_id || '').trim();
        if (!sessionId) {
            return res.status(400).json({ error: 'session_id requis' });
        }

        const session = await sessionRepository.findById(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session introuvable' });
        }

        const realtimeSession = buildRealtimeSessionConfig(session, { manual: false });

        res.json({
            model: realtimeSession.model,
        });
    } catch (err) {
        console.error('[Realtime] session:', err.message);
        res.status(500).json({ error: 'Erreur création session Realtime' });
    }
});

// POST /api/realtime/sdp
// Échange l'offre WebRTC côté serveur pour éviter les échecs navigateur (CORS/headers)
// et préserver la session éphémère configurée avec prompt + voix.
router.post('/sdp', authenticateToken, async (req, res) => {
    try {
        const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
        if (!apiKey) {
            return res.status(500).json({ error: 'OPENAI_API_KEY manquante' });
        }

        const sessionId = String(req.body?.session_id || '').trim();
        const sdp = String(req.body?.sdp || '');
        if (!sessionId) {
            return res.status(400).json({ error: 'session_id requis' });
        }
        if (!sdp.trim()) {
            return res.status(400).json({ error: 'sdp requis' });
        }

        const session = await sessionRepository.findById(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session introuvable' });
        }

        const realtimeMode = String(req.body?.realtime_mode || 'handsfree').trim().toLowerCase();
        const manual = realtimeMode === 'manual';

        console.log(`[Realtime] SDP length=${sdp.length} chars mode=${manual ? 'manual' : 'handsfree'}`);

        const sessionConfig = JSON.stringify(buildRealtimeSessionConfig(session, { manual }));
        const formData = new FormData();
        formData.set('sdp', sdp);
        formData.set('session', sessionConfig);

        const response = await fetch('https://api.openai.com/v1/realtime/calls', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            body: formData,
        });

        const answer = await response.text();
        if (!response.ok) {
            console.warn('[Realtime] SDP exchange refused:', response.status, answer);
            return res.status(response.status).json({
                error: answer || 'Impossible de connecter WebRTC Realtime',
            });
        }

        res.type('application/sdp').send(answer);
    } catch (err) {
        console.error('[Realtime] sdp:', err.message);
        res.status(500).json({ error: 'Erreur échange SDP Realtime' });
    }
});

// POST /api/realtime/tool
router.post('/tool', authenticateToken, async (req, res) => {
    try {
        const sessionId = String(req.body?.session_id || '').trim();
        const question = String(req.body?.question || '').trim();
        if (!sessionId || !question) {
            return res.status(400).json({ error: 'session_id et question requis' });
        }

        const context = await chatService.buildRealtimeResourceContext(sessionId, question);
        res.json(context);
    } catch (err) {
        console.error('[Realtime] tool:', err.message);
        res.status(500).json({
            error: err.message || 'Erreur outil Realtime',
        });
    }
});

// POST /api/realtime/message
router.post('/message', authenticateToken, async (req, res) => {
    try {
        const sessionId = String(req.body?.session_id || '').trim();
        const role = String(req.body?.role || '').trim().toLowerCase();
        const text = String(req.body?.text || '').trim();
        if (!sessionId || !text || !['user', 'assistant'].includes(role)) {
            return res.status(400).json({ error: 'session_id, role et text requis' });
        }

        await messageAssistanceRepository.saveMessage({
            session_id: sessionId,
            auteur: role === 'user' ? 'utilisateur' : 'assistant',
            transcription_texte: text,
        });

        res.json({ ok: true });
    } catch (err) {
        console.error('[Realtime] message:', err.message);
        res.status(500).json({ error: 'Erreur sauvegarde message Realtime' });
    }
});

module.exports = router;
