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
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: OPENAI_API_BASE_URL,
});

class SttService {
    async transcribe(fileStream, language = 'fr', originalName = 'audio.webm') {
        try {
            const normalizedLanguage = String(language || '').trim().toLowerCase();
            const options = {
                file: fileStream,
                model: resolveSttModel(),
            };

            // Si la langue est spécifiée et n'est pas 'auto', on l'ajoute comme indice
            if (normalizedLanguage && normalizedLanguage !== 'auto') {
                options.language = normalizedLanguage.split('-')[0];
            }

            const transcription = await openai.audio.transcriptions.create(options);
            return String(transcription?.text || '').trim();
        } catch (err) {
            console.error('SttService.transcribe:', err.message);
            throw err;
        }
    }
}

module.exports = new SttService();
