const { Chroma } = require('@langchain/community/vectorstores/chroma');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { ChromaClient } = require('chromadb');
const path = require('path');
const fs = require('fs');

/**
 * VectorStoreService - Gestion des documents dans ChromaDB.
 */
class VectorStoreService {
    constructor() {
        this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: 'text-embedding-3-small',
        });

        this.chromaUrl = 'http://localhost:8000';
        this.dbPath = path.join(process.cwd(), 'chroma_db');
        this.retrievalMode = String(process.env.RAG_RETRIEVAL_MODE || 'similarity').toLowerCase();
        this.defaultTopK = Number(process.env.RAG_TOP_K || 4);
        this.defaultFetchK = Number(process.env.RAG_FETCH_K || 12);
        this.defaultLambda = Number(process.env.RAG_MMR_LAMBDA || 0.35);
    }

    /**
     * Construit le nom de collection dynamique basé sur l'avatar ID.
     * @param {number} avatarId - ID de l'avatar
     * @returns {string} - Nom de collection (e.g., 'avatar_5')
     */
    getCollectionName(avatarId) {
        if (!avatarId) {
            throw new Error('[VectorStoreService] avatarId est requis pour construire le nom de collection');
        }
        return `avatar_${avatarId}`;
    }

    async getStore(avatarId) {
        if (!avatarId) {
            throw new Error('[VectorStoreService] avatarId est requis pour getStore()');
        }
        try {
            const collectionName = this.getCollectionName(avatarId);
            return await Chroma.fromExistingCollection(this.embeddings, {
                collectionName,
                url: this.chromaUrl,
            });
        } catch (error) {
            return null;
        }
    }

    async addDocuments(docs, avatarId) {
        if (!avatarId) {
            throw new Error('[VectorStoreService] avatarId est requis pour addDocuments()');
        }
        console.log(`[VectorStoreService] Indexation locale de ${docs.length} segments pour avatar_${avatarId}...`);

        // 1. Générer les embeddings avec OpenAI
        const texts = docs.map(doc => doc.pageContent);
        const embeddings = await this.embeddings.embedDocuments(texts);
        console.log(`[VectorStoreService] ${embeddings.length} embeddings générés`);

        // 2. Préparer les données avec embeddings + métadonnées
        const embeddingsData = docs.map((doc, index) => ({
            id: doc.metadata?.id || `doc_${Date.now()}_${index}`,
            embedding: embeddings[index],
            document: doc.pageContent,
            metadata: doc.metadata || {}
        }));

        // 3. Créer le dossier exports s'il n'existe pas
        const exportsDir = path.join(process.cwd(), 'exports');
        if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
            console.log(`[VectorStoreService] Dossier créé: ${exportsDir}`);
        }

        // 4. Ajouter les embeddings au fichier exports/embeddings_avatar_${avatarId}.json (fusion au lieu de remplacement)
        const embeddingsPath = path.join(exportsDir, `embeddings_avatar_${avatarId}.json`);
        let allEmbeddings = [];
        
        // Charger les embeddings existants s'ils existent
        if (fs.existsSync(embeddingsPath)) {
            try {
                const existingData = fs.readFileSync(embeddingsPath, 'utf-8');
                allEmbeddings = JSON.parse(existingData);
                console.log(`[VectorStoreService] ${allEmbeddings.length} embeddings existants chargés pour avatar_${avatarId}`);
            } catch (err) {
                console.warn(`[VectorStoreService] Erreur lecture ${path.basename(embeddingsPath)}, recommencement: ${err.message}`);
                allEmbeddings = [];
            }
        }
        
        // Fusionner avec les nouveaux embeddings (dédup par ID)
        const idMap = new Map(allEmbeddings.map(item => [item.id, item]));
        embeddingsData.forEach(item => idMap.set(item.id, item));
        allEmbeddings = Array.from(idMap.values());
        
        // Sauvegarder le fichier fusionné
        fs.writeFileSync(embeddingsPath, JSON.stringify(allEmbeddings, null, 2));
        console.log(`[VectorStoreService] ${allEmbeddings.length} embeddings totaux sauvegardés dans ${path.basename(embeddingsPath)}`);

        // 5. Ajouter à ChromaDB avec la collection dynamique
        const collectionName = this.getCollectionName(avatarId);
        return await Chroma.fromDocuments(docs, this.embeddings, {
            collectionName,
            url: this.chromaUrl,
        });
    }

    async search(query, k = 5, filter = undefined, avatarId, options = {}) {
        if (!avatarId) {
            throw new Error('[VectorStoreService] avatarId est requis pour search()');
        }
        try {
            const store = await this.getStore(avatarId);
            if (!store) {
                console.warn(`[VectorStoreService] Aucun store trouve pour avatar_${avatarId} (zero document indexe ?)`);
                return [];
            }
            const mode = String(options.mode || this.retrievalMode || 'similarity').toLowerCase();
            const topK = Number(options.k || k || this.defaultTopK || 8);
            const fetchK = Number(options.fetchK || this.defaultFetchK || Math.max(topK * 3, topK));
            const lambda = Number.isFinite(Number(options.lambda))
                ? Number(options.lambda)
                : this.defaultLambda;

            if (mode === 'mmr') {
                // Prefer LangChain retriever path for cross-store consistency.
                const retriever = store.asRetriever({
                    searchType: 'mmr',
                    k: topK,
                    searchKwargs: { fetchK, lambda, filter }
                });
                return await retriever.invoke(query);
            }

            // Pure LangChain baseline similarity retrieval via retriever.
            const retriever = store.asRetriever({
                searchType: 'similarity',
                k: topK,
                searchKwargs: { filter }
            });
            return await retriever.invoke(query);
        } catch (e) {
            console.error('[VectorStoreService] Erreur recherche:', e.message);
            return [];
        }
    }

    async deleteDocumentsByUuid(uuid, avatarId) {
        if (!avatarId) {
            throw new Error('[VectorStoreService] avatarId est requis pour deleteDocumentsByUuid()');
        }
        const client = new ChromaClient({ host: 'localhost', port: 8000, ssl: false });
        try {
            const collectionName = this.getCollectionName(avatarId);
            const collection = await client.getCollection({ name: collectionName });
            await collection.delete({ where: { uuid } });
            console.log(`[VectorStoreService] Document ${uuid} supprimé de avatar_${avatarId}`);
        } catch (e) {
            console.error('[VectorStoreService] Erreur suppression:', e.message);
        }
    }
}

module.exports = new VectorStoreService();
