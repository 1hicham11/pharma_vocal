const axios = require('axios');
const messageAssistanceRepository = require('../repositories/messageAssistanceRepository');
const rechercheRepository = require('../repositories/rechercheRepository');
const graphRagService = require('./graphRagService');

/**
 * AgentOrchestrator (Version Hybride)
 * - Délègue la réflexion (ReAct) au microservice Python.
 * - Gère la persistence SQL et les actions côté Node.js.
 */
class AgentOrchestrator {
    constructor() {
        this.pythonAgentUrl = process.env.FASTAPI_URL || 'http://localhost:8001';
    }

    async processMessage({ sessionId, userText, systemPrompt, avatarId, history = [] }) {
        // ── 1. Sauvegarde Utilisateur ──────────────────────────────────────────
        const userMessageId = await messageAssistanceRepository.saveMessage({
            session_id: sessionId,
            auteur: 'utilisateur',
            transcription_texte: userText,
        });

        if (!avatarId) {
            throw new Error('[Orchestrator] avatarId est requis pour processMessage()');
        }
        console.log(`[Orchestrator] Délégation de la requête à l'Agent Python ReAct (avatar_${avatarId})...`);

        try {
            // ── 2. Appel de l'Agent ReAct (Python) ─────────────────────────────
            const response = await axios.post(`${this.pythonAgentUrl}/agent`, {
                text: userText,
                avatar_id: avatarId
            }, {
                timeout: 30000 // Ajout d'un timeout de 30 secondes pour éviter le blocage infini
            });

            const responseText = response.data.output || "Désolé, je n'ai pas pu générer de réponse.";

            // ── 3. Analyse post-agent (Entités pour GraphRAG & Actions) ──────────
            // Note: On pourrait aussi renvoyer les entités depuis Python, 
            // mais on garde l'extraction locale pour ne pas tout casser.
            const entities = this._extractEntities(responseText + ' ' + userText);
            const graphRelations = this._buildPreliminaryRelations(entities);

            // Traçabilité
            await rechercheRepository.saveAction({
                message_id: userMessageId,
                requete_rag: userText,
                sources_utilisees: {
                    engine: 'python_react_agent',
                    agent_output: responseText,
                    entities
                },
            });

            // Actions pour l'UI
            const actions = this._dispatchActions(entities, [], []);

            // ── 4. Sauvegarde Assistant ───────────────────────────────────────────
            const assistantMessageId = await messageAssistanceRepository.saveMessage({
                session_id: sessionId,
                auteur: 'assistant',
                transcription_texte: responseText,
            });

            return {
                responseText,
                sources: [], // Les sources ont été gérées en interne par l'agent ReAct
                actions,
                messageId: assistantMessageId,
            };

        } catch (err) {
            console.error('[Orchestrator] Erreur Agent Python:', err.message);
            const errorMsg = "Erreur de communication avec l'agent intelligent.";
            
            await messageAssistanceRepository.saveMessage({
                session_id: sessionId,
                auteur: 'assistant',
                transcription_texte: errorMsg,
            });

            return { responseText: errorMsg, actions: [] };
        }
    }

    _dispatchActions(entities, interactions, chunks) {
        const actions = [];
        if (interactions.length > 0) {
            actions.push({
                type: 'ALERT_INTERACTION',
                payload: interactions,
                priority: 'HIGH',
                message: `⚠️ Interaction détectée : ${interactions.map(i => `${i.med1} ↔ ${i.med2}`).join(', ')}`,
            });
        }
        if (entities.medicaments.length > 0) {
            actions.push({
                type: 'PRODUCT_LOOKUP',
                payload: { medicaments: entities.medicaments },
                priority: 'NORMAL',
                message: `📋 Médicaments abordés : ${entities.medicaments.join(', ')}`,
            });
        }
        if (entities.pathologies.length > 0) {
            actions.push({
                type: 'PATHOLOGY_CONTEXT',
                payload: { pathologies: entities.pathologies },
                priority: 'NORMAL',
                message: `🏥 Pathologies identifiées : ${entities.pathologies.join(', ')}`,
            });
        }
        if (chunks.length > 0) {
            actions.push({
                type: 'RAG_SOURCES_USED',
                payload: { count: chunks.length, documents: [...new Set(chunks.map(c => c.document))] },
                priority: 'LOW',
                message: `📚 ${chunks.length} source(s) documentaire(s) utilisée(s)`,
            });
        }
        return actions;
    }

    _extractEntities(text) {
        if (!text) return { medicaments: [], pathologies: [], posologies: [], dci: [] };
        const normalize = str => str.toLowerCase().trim();
        const unique = arr => [...new Set(arr.map(normalize))];

        const posologiePattern = /(\d+\s*(?:mg|g|ml|µg|UI|unités?)\s*(?:\/\s*(?:jour|j|dose|prise))?(?:\s+(?:\d+\s*fois?\s*(?:par\s*jour)?|en\s*\d+\s*prises?))?)/gi;
        const pathoKeywords = [
            'hypertension', 'diabète', 'infection', 'pneumonie', 'bronchite', 'asthme', 'allergie',
            'douleur', 'inflammation', 'fièvre', 'migraine', 'dépression', 'anxiété', 'insomnie', 'cholestérol',
            'cardiopathie', 'insuffisance rénale', 'ulcère', 'gastrite', 'épilepsie', 'cancer'
        ];
        const dciSuffixPattern = /\b\w+(?:mab|nib|tinib|ciclib|zumab|lumab|olol|pril|sartan|statine?|mycine?|oxacine?|cilline?|azole?|vir|navir|mivir|prazole?)\b/gi;

        const medicaments = [];
        const pathologies = [];
        const posologies = [];
        const dci = [];

        posologies.push(...(text.match(posologiePattern) || []));
        pathoKeywords.forEach(k => { if (text.toLowerCase().includes(k)) pathologies.push(k); });
        dci.push(...(text.match(dciSuffixPattern) || []).filter(d => d.length > 4));
        medicaments.push(...(text.match(/\b[A-Z][A-Z0-9]{3,}\b/g) || []));

        return {
            medicaments: unique(medicaments).slice(0, 20),
            pathologies: unique(pathologies).slice(0, 10),
            posologies: unique(posologies).slice(0, 10),
            dci: unique(dci).slice(0, 15),
        };
    }

    _buildPreliminaryRelations(entities) {
        const relations = [];
        entities.medicaments.forEach(med => {
            entities.pathologies.forEach(patho => relations.push({ source: med, relation: 'utilisé_pour', target: patho }));
            entities.posologies.forEach(pos => relations.push({ source: med, relation: 'posologie', target: pos }));
            entities.dci.forEach(d => relations.push({ source: med, relation: 'dci_associée', target: d }));
        });
        return relations.slice(0, 50);
    }
}

module.exports = new AgentOrchestrator();
