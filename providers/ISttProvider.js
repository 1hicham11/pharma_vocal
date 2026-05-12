/**
 * Interface / Classe abstraite – ISttProvider
 * Tous les adaptateurs STT doivent implémenter cette interface.
 */
class ISttProvider {
    /**
     * Transcrit un flux audio en texte.
     * @param {ReadableStream} audioStream
     * @param {string} language
     * @param {string} originalName
     * @returns {Promise<string>}
     */
    async transcribe(audioStream, language = 'fr', originalName = 'audio.webm') {
        throw new Error(`${this.constructor.name} doit implémenter transcribe()`);
    }
}

module.exports = ISttProvider;
