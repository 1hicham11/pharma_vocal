const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

/**
 * RagFlowDocService – Gestion de la Base Documentaire RAG
 *
 * Permet à l'administrateur d'uploader, lister et supprimer
 * des documents dans un dataset RagFlow pour vectorisation.
 */
class RagFlowDocService {
    constructor() {
        this.apiUrl = process.env.RAGFLOW_API_URL || 'http://localhost:9380';
        this.apiKey = process.env.RAGFLOW_API_KEY || '';
        this.datasetId = process.env.RAGFLOW_DATASET_ID || '';
        this.timeout = 30000; // 30s pour les uploads
    }

    get headers() {
        return {
            Authorization: `Bearer ${this.apiKey}`,
        };
    }

    /**
     * Vérifie si RagFlow est configuré (clé API + dataset ID présents)
     */
    isConfigured() {
        return this.apiKey &&
            this.apiKey !== 'your_ragflow_api_key_here' &&
            this.datasetId;
    }

    /**
     * Upload un fichier vers le dataset RagFlow et démarre la vectorisation.
     * @param {string} filePath - Chemin local du fichier
     * @param {string} originalName - Nom d'origine du fichier
     * @returns {Promise<{ id, name, status }>}
     */
    async uploadDocument(filePath, originalName) {
        if (!this.isConfigured()) {
            throw new Error('RagFlow non configuré. Veuillez renseigner RAGFLOW_API_KEY et RAGFLOW_DATASET_ID dans .env');
        }

        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), {
            filename: originalName,
            contentType: this._getMimeType(originalName),
        });

        try {
            const response = await axios.post(
                `${this.apiUrl}/v1/dataset/${this.datasetId}/document`,
                form,
                {
                    headers: {
                        ...this.headers,
                        ...form.getHeaders(),
                    },
                    timeout: this.timeout,
                }
            );

            const doc = response.data?.data?.[0] || response.data;
            return {
                id: doc.id,
                name: doc.name || originalName,
                status: doc.run || 'processing',
                size: doc.size || 0,
                created_at: doc.create_time || new Date().toISOString(),
            };
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            throw new Error(`Erreur upload RagFlow : ${msg}`);
        }
    }

    /**
     * Liste tous les documents du dataset.
     * @returns {Promise<Array<{ id, name, status, size, created_at }>>}
     */
    async listDocuments() {
        if (!this.isConfigured()) {
            return { configured: false, documents: [] };
        }

        try {
            const response = await axios.get(
                `${this.apiUrl}/v1/dataset/${this.datasetId}/document`,
                {
                    headers: this.headers,
                    params: { page: 1, page_size: 100 },
                    timeout: this.timeout,
                }
            );

            const docs = response.data?.data?.docs || response.data?.data || [];
            return {
                configured: true,
                documents: docs.map(doc => ({
                    id: doc.id,
                    name: doc.name,
                    status: doc.run || 'unknown',
                    size: doc.size || 0,
                    created_at: doc.create_time || null,
                    chunk_count: doc.chunk_num || 0,
                })),
            };
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            throw new Error(`Erreur RagFlow : ${msg}`);
        }
    }

    /**
     * Supprime un document du dataset par son ID.
     * @param {string} docId
     */
    async deleteDocument(docId) {
        if (!this.isConfigured()) {
            throw new Error('RagFlow non configuré.');
        }

        try {
            await axios.delete(
                `${this.apiUrl}/v1/dataset/${this.datasetId}/document`,
                {
                    headers: {
                        ...this.headers,
                        'Content-Type': 'application/json',
                    },
                    data: { ids: [docId] },
                    timeout: this.timeout,
                }
            );
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            throw new Error(`Erreur suppression RagFlow : ${msg}`);
        }
    }

    /**
     * Retourne le type MIME d'un fichier selon son extension.
     */
    _getMimeType(filename) {
        const ext = path.extname(filename).toLowerCase();
        const types = {
            '.pdf':  'application/pdf',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.doc':  'application/msword',
            '.txt':  'text/plain',
            '.md':   'text/markdown',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        };
        return types[ext] || 'application/octet-stream';
    }
}

module.exports = new RagFlowDocService();
