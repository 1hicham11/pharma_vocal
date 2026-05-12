const ITtsProvider = require('./ITtsProvider');
const { Communicate } = require('edge-tts-universal');

/**
 * EdgeTtsAdapter
 * Adaptateur TTS utilisant Microsoft Edge TTS via edge-tts-universal.
 * Implémente ITtsProvider.
 */
class EdgeTtsAdapter extends ITtsProvider {
    constructor() {
        super();
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

    getVoiceId(lang) {
        const normalized = String(lang || 'auto').toLowerCase();
        if (normalized === 'ary' || normalized === 'darija' || normalized === 'ar-ma') {
            return process.env.EDGE_VOICE_ID_DARIJA || process.env.EDGE_VOICE_ID_AR || 'ar-MA-MounaNeural';
        }
        if (normalized === 'ar' || normalized.startsWith('ar-')) return process.env.EDGE_VOICE_ID_AR || 'ar-SA-HamedNeural';
        if (normalized === 'en' || normalized.startsWith('en-')) return process.env.EDGE_VOICE_ID_EN || 'en-US-GuyNeural';
        if (normalized === 'es' || normalized.startsWith('es-')) return process.env.EDGE_VOICE_ID_ES || 'es-ES-AlvaroNeural';
        if (normalized === 'it' || normalized.startsWith('it-')) return process.env.EDGE_VOICE_ID_IT || 'it-IT-DiegoNeural';
        // Voice masculine marocaine ou francophone par défaut pour le docteur
        return process.env.EDGE_VOICE_ID_FR || 'fr-FR-HenriNeural';
    }

    getProsodyOptions() {
        return {
            rate: process.env.EDGE_TTS_RATE || '+18%',
            volume: process.env.EDGE_TTS_VOLUME || '+0%',
            pitch: process.env.EDGE_TTS_PITCH || '+0Hz',
        };
    }

    /**
     * Génère l'audio complet (Buffer).
     * @param {string} text
     * @param {string} lang
     * @returns {Promise<Buffer>}
     */
    async generateSpeech(text, lang = 'fr') {
        try {
            const detected = this.detectLanguage(text);
            const requested = String(lang || 'auto').toLowerCase();
            const finalLang = (requested === 'auto' || requested === 'multilingual') ? detected : requested;
            const voiceId = this.getVoiceId(finalLang);

            const prosody = this.getProsodyOptions();
            console.log(`[EdgeTtsAdapter] generateSpeech (${voiceId}, rate=${prosody.rate}) pour: ${text.substring(0, 30)}...`);

            const communicate = new Communicate(text, { voice: voiceId, ...prosody });
            const chunks = [];

            for await (const chunk of communicate.stream()) {
                if (chunk.type === 'audio' && chunk.data) {
                    chunks.push(chunk.data);
                }
            }

            return Buffer.concat(chunks);
        } catch (err) {
            console.error(`EdgeTtsAdapter.generateSpeech error:`, err.message);
            throw err;
        }
    }

    /**
     * Génère l'audio en mode streaming (AsyncGenerator).
     * @param {string} text
     * @param {string} lang
     * @returns {AsyncGenerator<Buffer>}
     */
    async *streamSpeech(text, lang = 'fr') {
        try {
            const detected = this.detectLanguage(text);
            const requested = String(lang || 'auto').toLowerCase();
            const finalLang = (requested === 'auto' || requested === 'multilingual') ? detected : requested;
            const voiceId = this.getVoiceId(finalLang);

            const prosody = this.getProsodyOptions();
            console.log(`[EdgeTtsAdapter] 🎤 streamSpeech (${voiceId}, rate=${prosody.rate}) pour: ${text.substring(0, 30)}...`);

            const communicate = new Communicate(text, { voice: voiceId, ...prosody });
            let chunkCount = 0;
            let totalBytes = 0;
            let audioChunkCount = 0;

            for await (const chunk of communicate.stream()) {
                if (chunk.type === 'audio' && chunk.data) {
                    audioChunkCount++;
                    totalBytes += chunk.data.length;
                    console.log(`[EdgeTtsAdapter] 📡 Audio Chunk #${audioChunkCount}: ${chunk.data.length} bytes (total: ${totalBytes})`);
                    yield chunk.data;
                } else {
                    chunkCount++;
                    // Autres types de chunks (métadonnées, etc)
                    console.log(`[EdgeTtsAdapter] 📋 ${chunk.type} chunk reçu`);
                }
            }

            console.log(`[EdgeTtsAdapter] ✅ Stream terminé | ${audioChunkCount} audio chunks | ${totalBytes} bytes`);
        } catch (err) {
            console.error(`EdgeTtsAdapter.streamSpeech error:`, err.message);
            throw err;
        }
    }
}

module.exports = EdgeTtsAdapter;
