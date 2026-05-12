const axios = require('axios');
const rechercheRepository = require('../repositories/rechercheRepository');

/**
 * RagFlowService – Moteur de Compréhension Documentaire Profonde (DDU)
 * 
 * Interroge l'API RagFlow pour récupérer des chunks documentaires pertinents,
 * extrait les entités nommées (médicaments, pathologies, posologies)
 * et sauvegarde la traçabilité dans ACTIONS_RECHERCHE.
 */
class RagFlowService {
    constructor() {
        this.apiUrl = process.env.RAGFLOW_API_URL || 'http://localhost:9380';
        this.apiKey = process.env.RAGFLOW_API_KEY || '';
        this.timeout = 10000; // 10s
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. REQUÊTE RAG (Document Deep Understanding)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Interroge RagFlow et retourne les chunks enrichis + entités extraites.
     * @param {string} question      - La question de l'utilisateur
     * @param {string} datasetId     - ID du dataset RagFlow lié à l'avatar MySQL
     * @param {number} messageId     - ID du message MESSAGES pour la traçabilité
     * @returns {Promise<{ context: string, chunks: Array, entities: Object, graphRelations: Array }>}
     */
    async query(question, datasetId, messageId) {
        let chunks = [];
        let rawSources = [];
        let ragAvailable = false;

        // ── Appel API RagFlow ────────────────────────────────────────────────
        try {
            if (this.apiKey && datasetId) {
                const response = await axios.post(
                    `${this.apiUrl}/v1/retrieval`,
                    {
                        question,
                        dataset_ids: [datasetId],
                        top_k: 5,
                        similarity_threshold: 0.2,
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        timeout: this.timeout,
                    }
                );

                rawSources = response.data?.data?.chunks || [];
                chunks = rawSources.map(c => ({
                    content: c.content_with_weight || c.content || '',
                    score: c.similarity || 0,
                    document: c.document_keyword || c.doc_name || 'inconnu',
                    chunkId: c.id || null,
                }));
                ragAvailable = chunks.length > 0;
            }
        } catch (err) {
            console.warn('[RagFlow] API indisponible :', err.message);
        }

        // ── Extraction d'entités depuis les chunks ───────────────────────────
        const entities = this._extractEntities(chunks.map(c => c.content).join('\n'));
        const graphRelations = this._buildPreliminaryRelations(entities);

        // ── Traçabilité dans ACTIONS_RECHERCHE ───────────────────────────────
        if (messageId) {
            await rechercheRepository.saveAction({
                message_id: messageId,
                requete_rag: question,
                sources_utilisees: {
                    ragflow_available: ragAvailable,
                    dataset_id: datasetId,
                    chunks: chunks.slice(0, 5),   // 5 chunks max en DB
                    entities,
                    graph_relations: graphRelations,
                },
            });
        }

        // ── Construction du contexte textuel pour le LLM ────────────────────
        const context = chunks.length > 0
            ? `📚 Sources documentaires :\n${chunks.map((c, i) =>
                `[${i + 1}] (${c.document}) : ${c.content.substring(0, 400)}`
            ).join('\n\n')}`
            : '';

        return { context, chunks, entities, graphRelations };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. EXTRACTION D'ENTITÉS NOMMÉES (NLP léger, sans dépendance externe)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Extrait les entités nommées depuis le texte brut des chunks.
     * Utilise des patterns regex + listes métier pharma.
     * @param {string} text
     * @returns {{ medicaments: string[], pathologies: string[], posologies: string[], dci: string[] }}
     */
    _extractEntities(text) {
        const normalize = str => str.toLowerCase().trim();
        const unique = arr => [...new Set(arr.map(normalize))];

        // ── Patterns de posologie ────────────────────────────────────────────
        const posologiePattern = /(\d+\s*(?:mg|g|ml|µg|UI|unités?)\s*(?:\/\s*(?:jour|j|dose|prise))?(?:\s+(?:\d+\s*fois?\s*(?:par\s*jour)?|en\s*\d+\s*prises?))?)/gi;

        // ── Mots-clés de pathologies courants ────────────────────────────────
        const pathoKeywords = [
            'hypertension', 'diabète', 'diabète de type', 'infection',
            'pneumonie', 'bronchite', 'asthme', 'allergie',
            'douleur', 'inflammation', 'fièvre', 'migraine', 'dépression',
            'anxiété', 'insomnie', 'cholestérol', 'dyslipidémie',
            'cardiopathie', 'insuffisance rénale', 'insuffisance hépatique',
            'ulcère', 'gastrite', 'BPCO', 'épilepsie', 'cancer', 'tumeur',
        ];

        // ── Suffixes DCI typiques ─────────────────────────────────────────────
        const dciSuffixPattern = /\b\w+(?:mab|nib|tinib|ciclib|zumab|lumab|olol|pril|sartan|statine?|mycine?|oxacine?|cilline?|azole?|vir|virs|navir|mivir|prazole?)\b/gi;

        const medicaments = [];
        const pathologies = [];
        const posologies = [];
        const dci = [];

        // Extraction posologies
        const posMatches = text.match(posologiePattern) || [];
        posologies.push(...posMatches);

        // Extraction pathologies (recherche de mots-clés)
        pathoKeywords.forEach(k => {
            if (text.toLowerCase().includes(k)) pathologies.push(k);
        });

        // Extraction DCI via suffixes
        const dciMatches = text.match(dciSuffixPattern) || [];
        dci.push(...dciMatches.filter(d => d.length > 4));

        // Extraction des termes entre guillemets ou majuscules isolées (noms commerciaux)
        const tradeNames = text.match(/\b[A-Z][A-Z0-9]{3,}\b/g) || [];
        medicaments.push(...tradeNames);

        return {
            medicaments: unique(medicaments).slice(0, 20),
            pathologies: unique(pathologies).slice(0, 10),
            posologies: unique(posologies).slice(0, 10),
            dci: unique(dci).slice(0, 15),
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. RELATIONS PRÉLIMINAIRES (préparation pour GraphRAG)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Génère une liste de relations potentielles entre entités extraites.
     * Ces relations sont passées au GraphRagService pour construire le graphe.
     * @param {{ medicaments, pathologies, posologies, dci }} entities
     * @returns {Array<{ source, relation, target }>}
     */
    _buildPreliminaryRelations(entities) {
        const relations = [];

        entities.medicaments.forEach(med => {
            entities.pathologies.forEach(patho => {
                relations.push({ source: med, relation: 'utilisé_pour', target: patho });
            });
            entities.posologies.forEach(pos => {
                relations.push({ source: med, relation: 'posologie', target: pos });
            });
            entities.dci.forEach(d => {
                relations.push({ source: med, relation: 'dci_associée', target: d });
            });
        });

        return relations.slice(0, 50); // Limite pour éviter un graphe trop dense
    }
}

module.exports = new RagFlowService();
