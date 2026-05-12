const ITtsProvider = require('./ITtsProvider');
const EdgeTtsAdapter = require('./EdgeTtsAdapter');

/**
 * FallbackTtsAdapter
 * Edge TTS uniquement.
 * Si Edge echoue, le front utilise deja la voix navigateur en fallback.
 */
class FallbackTtsAdapter extends ITtsProvider {
    constructor() {
        super();
        this.providers = [
            { name: 'Edge', ctor: EdgeTtsAdapter, instance: null },
        ];
    }

    detectLanguage(text) {
        const arabicRegex = /[\u0600-\u06FF]/;
        const frenchRegex = /[àâçéèêëîïôûùüÿœæ]/i;
        if (arabicRegex.test(text)) return 'ar';
        if (frenchRegex.test(text)) return 'fr';
        return 'en';
    }

    _getProvider(entry) {
        if (entry.instance) return entry.instance;
        entry.instance = new entry.ctor();
        return entry.instance;
    }

    async generateSpeech(text, lang = 'fr') {
        const errors = [];

        for (const entry of this.providers) {
            try {
                const provider = this._getProvider(entry);
                console.log(`[FallbackTtsAdapter] Tentative generateSpeech via ${entry.name}`);
                const buffer = await provider.generateSpeech(text, lang);
                if (buffer && buffer.length > 0) {
                    console.log(`[FallbackTtsAdapter] Succes via ${entry.name}`);
                    return buffer;
                }
                throw new Error('Audio buffer vide');
            } catch (err) {
                const msg = err?.message || String(err);
                console.warn(`[FallbackTtsAdapter] Echec ${entry.name}: ${msg}`);
                errors.push(`${entry.name}: ${msg}`);
            }
        }

        throw new Error(`Tous les providers TTS ont echoue | ${errors.join(' | ')}`);
    }

    async *streamSpeech(text, lang = 'fr') {
        const errors = [];
        const startTime = Date.now();

        for (const entry of this.providers) {
            try {
                const provider = this._getProvider(entry);
                console.log(`[FallbackTtsAdapter] 🎤 Tentative streamSpeech via ${entry.name}`);
                const stream = provider.streamSpeech(text, lang);
                let chunkCount = 0;
                let totalBytes = 0;

                for await (const chunk of stream) {
                    chunkCount++;
                    totalBytes += chunk.length;
                    console.log(`[FallbackTtsAdapter] 📡 ${entry.name} Chunk #${chunkCount}: ${chunk.length} bytes (total: ${totalBytes})`);
                    yield chunk;
                }

                if (chunkCount > 0) {
                    const duration = Date.now() - startTime;
                    console.log(`[FallbackTtsAdapter] ✅ Succès via ${entry.name} | ${chunkCount} chunks | ${totalBytes} bytes | ${duration}ms`);
                    return;
                }

                throw new Error('Flux audio vide');
            } catch (err) {
                const msg = err?.message || String(err);
                console.warn(`[FallbackTtsAdapter] ⚠️ Echec ${entry.name}: ${msg}, tentative fallback...`);
                errors.push(`${entry.name}: ${msg}`);
            }
        }

        throw new Error(`Tous les providers TTS ont echoue | ${errors.join(' | ')}`);
    }
}

module.exports = FallbackTtsAdapter;
