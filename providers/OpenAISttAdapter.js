const ISttProvider = require('./ISttProvider');
const OpenAI = require('openai');
const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

function resolveSttModel() {
    const requestedModel = String(process.env.OPENAI_STT_MODEL || '').trim();
    if (!requestedModel) return 'gpt-4o-mini-transcribe';
    if (/whisper-large-v3|turbo|llama|groq|versatile/i.test(requestedModel)) {
        return 'gpt-4o-mini-transcribe';
    }
    return requestedModel;
}

function normalizeSttLanguage(language) {
    const value = String(language || 'auto').trim().toLowerCase();
    if (!value || value === 'auto' || value === 'multilingual') return null;
    if (['darija', 'ary', 'ar-ma', 'ar_ma', 'ma'].includes(value)) return null;
    const base = value.split('-')[0].split('_')[0];
    if (['fr', 'en', 'ar', 'es', 'it'].includes(base)) return base;
    return null;
}

/**
 * OpenAISttAdapter
 * Adaptateur STT base sur l'API OpenAI.
 * Implemente ISttProvider.
 */
class OpenAISttAdapter extends ISttProvider {
    constructor() {
        super();
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: OPENAI_API_BASE_URL,
        });
    }

    /**
     * @param {ReadableStream} audioStream
     * @param {string} language
     * @param {string} originalName
     * @returns {Promise<string>}
     */
    async transcribe(audioStream, language = 'auto', originalName = 'audio.webm') {
        try {
            const normalizedLanguage = normalizeSttLanguage(language);
            const options = {
                file: audioStream,
                model: resolveSttModel()
            };
            if (normalizedLanguage) options.language = normalizedLanguage;

            const transcription = await this.openai.audio.transcriptions.create(options);
            return String(transcription?.text || '').trim();
        } catch (err) {
            console.error('OpenAISttAdapter.transcribe:', err.message);
            throw err;
        }
    }
}

module.exports = OpenAISttAdapter;
