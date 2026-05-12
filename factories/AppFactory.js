const OpenAISttAdapter = require('../providers/OpenAISttAdapter');
const OpenAITtsAdapter = require('../providers/OpenAITtsAdapter');
const ElevenLabsTtsAdapter = require('../providers/ElevenLabsTtsAdapter');
const FallbackTtsAdapter = require('../providers/FallbackTtsAdapter');
const IAEvaluationStrategy = require('../strategies/IAEvaluationStrategy');

/**
 * AppFactory
 * Crée et assemble les dépendances de l'application.
 * Point central de la composition (Dependency Injection manuelle).
 */
class AppFactory {
    constructor() {
        // Instances uniques (singletons)
        this._sttProvider = new OpenAISttAdapter();
        this._ttsProvider = this.createTtsProvider();
        this._elevenLabsProvider = null;
        this._elevenLabsInitFailed = false;
        this._iaStrategy = new IAEvaluationStrategy();
    }

    createTtsProvider() {
        const provider = String(process.env.TTS_PROVIDER || 'openai').trim().toLowerCase();
        if (provider === 'elevenlabs' || provider === 'eleven') {
            if (!process.env.ELEVENLABS_API_KEY) {
                console.warn('[AppFactory] TTS provider ElevenLabs demandé mais ELEVENLABS_API_KEY est vide — fallback Edge.');
                return new FallbackTtsAdapter();
            }
            console.log('[AppFactory] TTS provider: ElevenLabs');
            return new ElevenLabsTtsAdapter();
        }

        if (provider === 'openai') {
            console.log('[AppFactory] TTS provider: OpenAI');
            return new OpenAITtsAdapter();
        }

        console.log('[AppFactory] TTS provider: Edge/Fallback');
        return new FallbackTtsAdapter();
    }

    /** @returns {import('../providers/ISttProvider')} */
    getSttProvider() {
        return this._sttProvider;
    }

    /** @returns {import('../providers/ITtsProvider')} */
    getTtsProvider() {
        return this._ttsProvider;
    }

    /**
     * Provider ElevenLabs à la demande, indépendant de TTS_PROVIDER.
     * Utilisé quand un agent a un vocal_id spécifique, ou pour /api/tts/voices.
     * @returns {import('../providers/ElevenLabsTtsAdapter')|null}
     */
    getElevenLabsTtsProvider() {
        if (this._elevenLabsProvider) return this._elevenLabsProvider;
        if (this._elevenLabsInitFailed) return null;
        if (!process.env.ELEVENLABS_API_KEY) {
            this._elevenLabsInitFailed = true;
            return null;
        }
        try {
            this._elevenLabsProvider = new ElevenLabsTtsAdapter();
            console.log('[AppFactory] ElevenLabs TTS provider initialisé (à la demande)');
            return this._elevenLabsProvider;
        } catch (err) {
            console.warn('[AppFactory] Initialisation ElevenLabs échouée:', err.message);
            this._elevenLabsInitFailed = true;
            return null;
        }
    }

    /** @returns {import('../strategies/EvaluationStrategy')} */
    getIAStrategy() {
        return this._iaStrategy;
    }

    /**
     * Construit un ChatService injecté avec les providers STT et TTS.
     * @returns {import('../services/chatService')}
     */
    buildChatService() {
        const ChatService = require('../services/chatService');
        return new ChatService(this._sttProvider, this._ttsProvider);
    }

    /**
     * Construit un EvaluateService injecté avec la stratégie IA.
     * @returns {import('../services/evaluateService')}
     */
    buildEvaluateService() {
        const EvaluateService = require('../services/evaluateService');
        return new EvaluateService(this._iaStrategy);
    }
}

// Singleton de l'application
module.exports = new AppFactory();
