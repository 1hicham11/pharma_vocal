const pdfParseModule = require('pdf-parse');
const fs = require('fs');
const path = require('path');

function resolvePdfParser() {
    if (pdfParseModule?.PDFParse) return { type: 'class', parser: pdfParseModule.PDFParse };
    if (typeof pdfParseModule === 'function') return { type: 'function', parser: pdfParseModule };
    if (typeof pdfParseModule?.default === 'function') return { type: 'function', parser: pdfParseModule.default };
    return { type: 'none', parser: null };
}

async function test() {
    try {
        const resolved = resolvePdfParser();
        console.log('pdf-parse resolved type:', resolved.type);
        const pdfPath = path.join(__dirname, 'guide_vocal_rag_v2.pdf');
        const dataBuffer = fs.readFileSync(pdfPath);
        let parser;
        let data;
        if (resolved.type === 'class') {
            parser = new resolved.parser({ data: dataBuffer });
            data = await parser.getText();
            await parser.destroy().catch(() => {});
        } else if (resolved.type === 'function') {
            data = await resolved.parser(dataBuffer);
        } else {
            throw new Error('PDF parser not available');
        }
        console.log('Text extracted length:', data.text.length);
        console.log('First 100 chars:', data.text.substring(0, 100));
    } catch (e) {
        console.error('Test failed:', e);
    }
}

test();
