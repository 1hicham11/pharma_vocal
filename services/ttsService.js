const OpenAITtsAdapter = require('../providers/OpenAITtsAdapter');

class TtsService {
    constructor() {
        this.adapter = new OpenAITtsAdapter();
    }

    detectLanguage(text) {
        return this.adapter.detectLanguage(text);
    }

    getVoiceId(lang) {
        return this.adapter.getVoiceId(lang);
    }

    async generateSpeech(text, lang = 'fr') {
        return this.adapter.generateSpeech(text, lang);
    }

    async *streamSpeech(text, lang = 'fr') {
        yield* this.adapter.streamSpeech(text, lang);
    }
}

module.exports = new TtsService();
