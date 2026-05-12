const ITtsProvider = require('./ITtsProvider');
const OpenAI = require('openai');

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

/**
 * OpenAITtsAdapter
 * Adaptateur TTS utilisant l'API OpenAI.
 * Implemente ITtsProvider.
 */
class OpenAITtsAdapter extends ITtsProvider {
    constructor() {
        super();
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: OPENAI_API_BASE_URL,
        });
    }

    detectLanguage(text) {
        const arabicRegex = /[\u0600-\u06FF]/;
        const frenchRegex = /[àâçéèêëîïôûùüÿœæ]/i;
        const spanishRegex = /[áéíóúñ¿¡]/i;
        const italianRegex = /\b(ciao|grazie|prego|buongiorno|buonasera|dottore|farmaco|medico)\b/i;
        const darijaLatinRegex = /\b(salam|sba7|labas|kidayr|kidayra|bghit| بغيت |wach|chno|mzyan| بزاف |bzaf|kan|kayn|dyal|dial|fhamtini|khoya|khti)\b/i;
        if (arabicRegex.test(text)) return 'ar';
        if (darijaLatinRegex.test(text)) return 'ary';
        if (spanishRegex.test(text)) return 'es';
        if (italianRegex.test(text)) return 'it';
        if (frenchRegex.test(text)) return 'fr';
        return 'en';
    }

    getVoiceId(lang = 'fr') {
        const normalized = String(lang || 'auto').toLowerCase();
        if (normalized === 'ar' || normalized.startsWith('ar-')) return process.env.OPENAI_VOICE_ID_AR || process.env.OPENAI_VOICE_ID || 'onyx';
        if (normalized === 'ary' || normalized === 'darija') return process.env.OPENAI_VOICE_ID_DARIJA || process.env.OPENAI_VOICE_ID_AR || process.env.OPENAI_VOICE_ID || 'onyx';
        if (normalized === 'en' || normalized.startsWith('en-')) return process.env.OPENAI_VOICE_ID_EN || process.env.OPENAI_VOICE_ID || 'onyx';
        if (normalized === 'es' || normalized.startsWith('es-')) return process.env.OPENAI_VOICE_ID_ES || process.env.OPENAI_VOICE_ID || 'onyx';
        if (normalized === 'it' || normalized.startsWith('it-')) return process.env.OPENAI_VOICE_ID_IT || process.env.OPENAI_VOICE_ID || 'onyx';
        return process.env.OPENAI_VOICE_ID_FR || process.env.OPENAI_VOICE_ID || 'onyx';
    }

    getModelId() {
        const requestedModel = String(process.env.OPENAI_TTS_MODEL || '').trim();
        if (!requestedModel) return 'gpt-4o-mini-tts';
        if (/(llama|mixtral|gemma|versatile|groq)/i.test(requestedModel)) return 'gpt-4o-mini-tts';
        return requestedModel;
    }

    buildSpeechParams(text, lang = 'fr') {
        const detected = this.detectLanguage(text);
        const requested = String(lang || 'auto').toLowerCase();
        const finalLang = (requested === 'auto' || requested === 'multilingual') ? detected : requested;
        return {
            model: this.getModelId(),
            voice: this.getVoiceId(finalLang),
            input: String(text || ''),
            format: 'mp3',
        };
    }

    async fetchAudioBuffer(text, lang = 'fr') {
        const params = this.buildSpeechParams(text, lang);
        console.log(`[OpenAITtsAdapter] generateSpeech (${params.model}, ${params.voice}) pour: ${String(text).substring(0, 30)}...`);
        const response = await this.openai.audio.speech.create(params);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    async generateSpeech(text, lang = 'fr') {
        return this.fetchAudioBuffer(text, lang);
    }

    async *streamSpeech(text, lang = 'fr') {
        const params = this.buildSpeechParams(text, lang);
        console.log(`[OpenAITtsAdapter] streamSpeech (${params.model}, ${params.voice}) pour: ${String(text).substring(0, 30)}...`);
        const response = await this.openai.audio.speech.create(params);

        if (response && response.body && typeof response.body.getReader === 'function') {
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value && value.length > 0) {
                    yield Buffer.from(value);
                }
            }
            return;
        }

        const buffer = await this.fetchAudioBuffer(text, lang);
        const chunkSize = Number(process.env.OPENAI_TTS_STREAM_CHUNK_SIZE || 4096);
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
            yield buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
        }
    }
}

module.exports = OpenAITtsAdapter;
