const fs = require('fs');
const pdfParseModule = require('pdf-parse');

function resolvePdfParser() {
    if (pdfParseModule?.PDFParse) {
        return { type: 'class', parser: pdfParseModule.PDFParse };
    }
    if (typeof pdfParseModule === 'function') {
        return { type: 'function', parser: pdfParseModule };
    }
    if (typeof pdfParseModule?.default === 'function') {
        return { type: 'function', parser: pdfParseModule.default };
    }
    return { type: 'none', parser: null };
}
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { Document } = require('@langchain/core/documents');
const vectorStoreService = require('./vectorStoreService');

/**
 * DocumentProcessor - Gère l'extraction et le découpage des PDF.
 */
class DocumentProcessor {
    constructor() {
        this.splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
    }

    /**
     * Traite un fichier PDF et l'ajoute au VectorStore.
     * @param {string} filePath - Chemin absolu du fichier
     * @param {Object} metadata - Métadonnées (ex: nom du document)
     * @param {number} avatarId - ID de l'avatar pour la collection ChromaDB
     */
    async processPDF(filePath, metadata = {}, avatarId) {
        console.log(`[DocumentProcessor] Lecture du PDF: ${filePath}`);
        const dataBuffer = fs.readFileSync(filePath);
        
        const resolved = resolvePdfParser();
        let parser;
        let data;
        try {
            if (resolved.type === 'class') {
                parser = new resolved.parser({ data: dataBuffer });
                data = await parser.getText();
            } else if (resolved.type === 'function') {
                data = await resolved.parser(dataBuffer);
            } else {
                throw new Error('PDF parser not available in pdf-parse module');
            }
        } finally {
            if (parser) {
                await parser.destroy().catch(() => {});
            }
        }
        
        const chunks = await this.splitter.splitText(data.text);
        
        const docs = chunks.map(chunk => new Document({
            pageContent: chunk,
            metadata: {
                ...metadata,
                source: metadata.filename || filePath,
            }
        }));

        if (!avatarId) {
            throw new Error('[DocumentProcessor] avatarId est requis pour processPDF()');
        }
        await vectorStoreService.addDocuments(docs, avatarId);
        console.log(`[DocumentProcessor] ${docs.length} segments indexés pour ${metadata.filename} (avatar_${avatarId})`);
        return docs.length;
    }
}

module.exports = new DocumentProcessor();
