const ITtsProvider = require('./ITtsProvider');
const { ElevenLabsClient } = require('elevenlabs');

/**
 * ElevenLabsTtsAdapter
 * Adaptateur TTS utilisant l'API ElevenLabs.
 * Implémente ITtsProvider.
 */
class ElevenLabsTtsAdapter extends ITtsProvider {
    constructor() {
        super();
        this.client = new ElevenLabsClient({
            apiKey: process.env.ELEVENLABS_API_KEY,
        });
    }

    detectLanguage(text) {
        const arabicRegex = /[\u0600-\u06FF]/;
        const frenchRegex = /[àâçéèêëîïôûùüÿœæ]/i;
        const spanishRegex = /[áéíóúñ¿¡]/i;
        const italianRegex = /\b(ciao|grazie|prego|buongiorno|buonasera|dottore|farmaco|medico)\b/i;
        const darijaLatinRegex = /\b(salam|sba7|labas|kidayr|kidayra|bghit|wach|chno|mzyan|bzaf|kayn|dyal|dial|fhamtini|khoya|khti)\b/i;
        if (arabicRegex.test(text)) return 'ar';
        if (darijaLatinRegex.test(text)) return 'ary';
        if (spanishRegex.test(text)) return 'es';
        if (italianRegex.test(text)) return 'it';
        if (frenchRegex.test(text)) return 'fr';
        return 'en';
    }

    getVoiceId(lang = 'fr', options = {}) {
        if (options.voiceId) return String(options.voiceId).trim();
        const normalized = String(lang || 'auto').toLowerCase();
        if (normalized === 'ar' || normalized.startsWith('ar-')) {
            return process.env.ELEVENLABS_VOICE_ID_AR || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
        }
        if (normalized === 'ary' || normalized === 'darija') {
            return process.env.ELEVENLABS_VOICE_ID_DARIJA || process.env.ELEVENLABS_VOICE_ID_AR || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
        }
        if (normalized === 'en' || normalized.startsWith('en-')) {
            return process.env.ELEVENLABS_VOICE_ID_EN || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
        }
        if (normalized === 'es' || normalized.startsWith('es-')) {
            return process.env.ELEVENLABS_VOICE_ID_ES || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
        }
        if (normalized === 'it' || normalized.startsWith('it-')) {
            return process.env.ELEVENLABS_VOICE_ID_IT || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
        }
        return process.env.ELEVENLABS_VOICE_ID_FR || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    }

    getModelId() {
        return String(process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2').trim();
    }

    getVoiceSettings() {
        const settings = {};
        const stability = Number(process.env.ELEVENLABS_STABILITY);
        const similarityBoost = Number(process.env.ELEVENLABS_SIMILARITY_BOOST);
        const style = Number(process.env.ELEVENLABS_STYLE);
        const speed = Number(process.env.ELEVENLABS_SPEED);

        if (Number.isFinite(stability)) settings.stability = stability;
        if (Number.isFinite(similarityBoost)) settings.similarity_boost = similarityBoost;
        if (Number.isFinite(style)) settings.style = style;
        if (Number.isFinite(speed)) settings.speed = speed;
        if (String(process.env.ELEVENLABS_USE_SPEAKER_BOOST || '').trim()) {
            settings.use_speaker_boost = ['1', 'true', 'yes'].includes(String(process.env.ELEVENLABS_USE_SPEAKER_BOOST).toLowerCase());
        }

        return Object.keys(settings).length ? settings : undefined;
    }

    buildSpeechParams(text) {
        const params = {
            text: String(text || ''),
            model_id: this.getModelId(),
            output_format: process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128',
        };
        const voiceSettings = this.getVoiceSettings();
        if (voiceSettings) params.voice_settings = voiceSettings;
        return params;
    }

    assertConfigured() {
        if (!process.env.ELEVENLABS_API_KEY) {
            throw new Error('ELEVENLABS_API_KEY manquant');
        }
    }

    async generateSpeech(text, lang = 'fr', options = {}) {
        const chunks = [];
        for await (const chunk of this.streamSpeech(text, lang, options)) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    async *streamSpeech(text, lang = 'fr', options = {}) {
        this.assertConfigured();
        const detected = this.detectLanguage(text);
        const requested = String(lang || 'auto').toLowerCase();
        const finalLang = (requested === 'auto' || requested === 'multilingual') ? detected : requested;
        const voiceId = this.getVoiceId(finalLang, options);
        const params = this.buildSpeechParams(text);

        console.log(`[ElevenLabsTtsAdapter] streamSpeech (${params.model_id}, ${voiceId}) pour: ${String(text).substring(0, 30)}...`);
        const audioStream = await this.client.textToSpeech.convertAsStream(
            voiceId,
            params,
            {
                timeoutInSeconds: Number(process.env.ELEVENLABS_TIMEOUT_SECONDS || 60),
                maxRetries: Number(process.env.ELEVENLABS_MAX_RETRIES || 2),
            }
        );

        for await (const chunk of audioStream) {
            if (chunk && chunk.length > 0) {
                yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            }
        }
    }

    async listVoices() {
        this.assertConfigured();
        const response = await this.client.voices.getAll(
            {},
            {
                timeoutInSeconds: Number(process.env.ELEVENLABS_TIMEOUT_SECONDS || 30),
                maxRetries: Number(process.env.ELEVENLABS_MAX_RETRIES || 2),
            }
        );
        const voices = Array.isArray(response?.voices) ? response.voices : [];
        return voices.map((voice) => ({
            voice_id: voice.voice_id,
            name: voice.name || voice.voice_id,
            category: voice.category || null,
            description: voice.description || '',
            preview_url: voice.preview_url || null,
            labels: voice.labels || {},
        }));
    }
}

module.exports = ElevenLabsTtsAdapter;
