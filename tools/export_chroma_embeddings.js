const { ChromaClient } = require('chromadb');
const fs = require('fs');
const path = require('path');

async function main() {
    const args = process.argv.slice(2);
    const collectionName = args[0] || 'pharma_docs';
    const outputArg = args[1] || '';
    const outputMode = (args[2] || 'wrapped').toLowerCase(); // wrapped | flat | jsonl

    const host = process.env.CHROMA_HOST || 'localhost';
    const port = Number(process.env.CHROMA_PORT || 8000);
    const batchSize = Number(process.env.CHROMA_EXPORT_BATCH || 500);

    const defaultExt = outputMode === 'jsonl' ? 'jsonl' : 'json';
    const outputPath = outputArg
        ? path.resolve(outputArg)
        : path.join(process.cwd(), 'exports', `chroma_${collectionName}_embeddings.${defaultExt}`);

    const client = new ChromaClient({ host, port, ssl: false });
    const collection = await client.getCollection({ name: collectionName });

    const total = await collection.count();
    const result = {
        collection: collectionName,
        total,
        dimension: null,
        items: [],
    };

    for (let offset = 0; offset < total; offset += batchSize) {
        const limit = Math.min(batchSize, total - offset);
        const res = await collection.get({
            include: ['embeddings', 'metadatas', 'documents', 'ids'],
            limit,
            offset,
        });

        const ids = res.ids || [];
        const embeddings = res.embeddings || [];
        const metadatas = res.metadatas || [];
        const documents = res.documents || [];

        for (let i = 0; i < ids.length; i += 1) {
            const embedding = embeddings[i] || null;
            if (result.dimension === null && embedding) {
                result.dimension = embedding.length;
            }
            result.items.push({
                id: ids[i],
                embedding,
                metadata: metadatas[i] || null,
                document: documents[i] || null,
            });
        }
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    if (outputMode === 'flat') {
        fs.writeFileSync(outputPath, JSON.stringify(result.items, null, 2), 'utf8');
    } else if (outputMode === 'jsonl') {
        const lines = result.items.map((item) => JSON.stringify(item));
        fs.writeFileSync(outputPath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
    } else {
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    }

    console.log(`Exported ${result.items.length} embeddings to ${outputPath} (${outputMode})`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
