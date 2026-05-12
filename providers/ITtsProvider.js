/**
 * Interface / Classe abstraite – ITtsProvider
 * Tous les adaptateurs TTS doivent implémenter cette interface.
 */
class ITtsProvider {
    /**
     * Génère l'audio complet sous forme de Buffer.
     * @param {string} text
     * @param {string} lang
     * @returns {Promise<Buffer>}
     */
    async generateSpeech(text, lang = 'fr') {
        throw new Error(`${this.constructor.name} doit implémenter generateSpeech()`);
    }

    /**
     * Génère l'audio en mode streaming (AsyncGenerator de Buffer chunks).
     * @param {string} text
     * @param {string} lang
     * @returns {AsyncGenerator<Buffer>}
     */
    async *streamSpeech(text, lang = 'fr') {
        throw new Error(`${this.constructor.name} doit implémenter streamSpeech()`);
    }

    /**
     * Détecte la langue du texte.
     * @param {string} text
     * @returns {string}
     */
    detectLanguage(text) {
        throw new Error(`${this.constructor.name} doit implémenter detectLanguage()`);
    }
}

module.exports = ITtsProvider;
