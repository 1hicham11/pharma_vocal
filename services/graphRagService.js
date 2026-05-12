/**
 * GraphRagService – Intelligence Relationnelle entre Entités Pharma
 * 
 * Construit un graphe de connaissance en mémoire (Map/Set, sans dépendance externe)
 * à partir des entités et relations extraites par RagFlowService.
 * 
 * Compatible avec une migration future vers Neo4j ou une base graphe dédiée.
 * 
 * Nœuds : médicaments, pathologies, DCI, posologies, médecins
 * Arêtes : "utilisé_pour", "contre-indiqué-avec", "posologie", "dci_associée", "prescrit_par"
 */
class GraphRagService {
    constructor() {
        // Structure du graphe : Map<nodeId, { label, type, edges: Array<{ relation, target }> }>
        this._graph = new Map();
        this._nodeCount = 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. CONSTRUCTION DU GRAPHE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Intègre les chunks et relations préliminaires dans le graphe en mémoire.
     * Appelé après chaque requête RagFlow.
     * @param {Array<{ source, relation, target }>} relations  - Issues de ragflowService._buildPreliminaryRelations
     * @param {{ medicaments, pathologies, dci, posologies }} entities
     */
    buildEntityGraph(relations, entities) {
        // ── Ajouter les nœuds ────────────────────────────────────────────────
        [...(entities.medicaments || [])].forEach(m => this._upsertNode(m, 'medicament'));
        [...(entities.pathologies || [])].forEach(p => this._upsertNode(p, 'pathologie'));
        [...(entities.dci || [])].forEach(d => this._upsertNode(d, 'dci'));
        [...(entities.posologies || [])].forEach(p => this._upsertNode(p, 'posologie'));

        // ── Ajouter les arêtes ───────────────────────────────────────────────
        relations.forEach(({ source, relation, target }) => {
            if (!source || !target) return;
            this._upsertNode(source);
            this._upsertNode(target);
            const node = this._graph.get(this._normalize(source));
            const already = node.edges.some(e => e.relation === relation && e.target === this._normalize(target));
            if (!already) {
                node.edges.push({ relation, target: this._normalize(target) });
            }
        });

        console.log(`[GraphRAG] Graphe : ${this._graph.size} nœuds, ${this._edgeCount()} arêtes`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. ENRICHISSEMENT DU CONTEXTE (pour le LLM)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Enrichit une requête utilisateur avec le contexte relationnel du graphe.
     * @param {string} query        - Question de l'utilisateur
     * @param {Object} entities     - Entités extraites du message courant
     * @returns {string}            - Contexte textuel enrichi pour le prompt LLM
     */
    enrichContext(query, entities) {
        const lines = [];
        const allEntities = [
            ...(entities.medicaments || []),
            ...(entities.pathologies || []),
            ...(entities.dci || []),
        ];

        allEntities.forEach(entityName => {
            const related = this.getRelatedEntities(entityName, 2); // profondeur 2
            if (related.length > 0) {
                lines.push(`• ${entityName} → ${related.map(r => `${r.relation} [${r.entity}]`).join(', ')}`);
            }
        });

        if (lines.length === 0) return '';

        return `\n🕸️ Contexte relationnel (GraphRAG) :\n${lines.join('\n')}`;
    }

    /**
     * Traverse le graphe (BFS) depuis une entité et retourne ses voisins.
     * @param {string} entityName
     * @param {number} depth          - Profondeur de traversée (1 ou 2)
     * @returns {Array<{ entity, relation, distance }>}
     */
    getRelatedEntities(entityName, depth = 1) {
        const startId = this._normalize(entityName);
        const node = this._graph.get(startId);
        if (!node) return [];

        const visited = new Set([startId]);
        const result = [];
        const queue = node.edges.map(e => ({ ...e, distance: 1 }));

        while (queue.length > 0) {
            const { relation, target, distance } = queue.shift();
            if (visited.has(target)) continue;
            visited.add(target);
            result.push({ entity: target, relation, distance });

            if (distance < depth) {
                const neighbor = this._graph.get(target);
                if (neighbor) {
                    neighbor.edges.forEach(e => {
                        if (!visited.has(e.target)) {
                            queue.push({ ...e, distance: distance + 1 });
                        }
                    });
                }
            }
        }
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. DÉTECTION D'INTERACTIONS (action concrète)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Vérifie s'il existe des contre-indications entre les médicaments mentionnés.
     * @param {string[]} medicaments
     * @returns {Array<{ med1, med2, relation }>}
     */
    detectInteractions(medicaments) {
        const interactions = [];
        for (let i = 0; i < medicaments.length; i++) {
            const nodeId = this._normalize(medicaments[i]);
            const node = this._graph.get(nodeId);
            if (!node) continue;

            node.edges
                .filter(e => e.relation === 'contre-indiqué-avec')
                .forEach(e => {
                    if (medicaments.map(m => this._normalize(m)).includes(e.target)) {
                        interactions.push({
                            med1: medicaments[i],
                            med2: e.target,
                            relation: e.relation,
                        });
                    }
                });
        }
        return interactions;
    }

    /**
     * Exporte le graphe en JSON (pour inspection ou persistance future).
     * @returns {Object}
     */
    exportGraph() {
        const nodes = [];
        const edges = [];
        this._graph.forEach((node, id) => {
            nodes.push({ id, label: node.label, type: node.type });
            node.edges.forEach(e => {
                edges.push({ source: id, relation: e.relation, target: e.target });
            });
        });
        return { nodes, edges };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVÉS
    // ─────────────────────────────────────────────────────────────────────────

    _normalize(str) {
        return str.toLowerCase().trim().replace(/\s+/g, '_');
    }

    _upsertNode(label, type = 'unknown') {
        const id = this._normalize(label);
        if (!this._graph.has(id)) {
            this._graph.set(id, { label, type, edges: [] });
            this._nodeCount++;
        } else if (type !== 'unknown') {
            this._graph.get(id).type = type;
        }
    }

    _edgeCount() {
        let count = 0;
        this._graph.forEach(n => { count += n.edges.length; });
        return count;
    }
}

// Singleton – le graphe persiste en mémoire во время toute la durée de vie du serveur
module.exports = new GraphRagService();
