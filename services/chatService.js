const messageAssistanceRepository = require('../repositories/messageAssistanceRepository');
const vectorStoreService = require('./langchain/vectorStoreService');
const connection = require('../db/connection');
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');

const OPENROUTER_CHAT_BASE_URL = 'https://openrouter.ai/api/v1';
let chatOpenRouterLogged = false;

function resolveChatLlmProvider() {
    const raw = String(process.env.CHAT_LLM_PROVIDER || '').trim().toLowerCase();
    if (raw === 'openrouter') return 'openrouter';
    if (['1', 'true', 'yes'].includes(String(process.env.CHAT_USE_OPENROUTER || '').trim().toLowerCase())) {
        return 'openrouter';
    }
    return 'openai';
}

/** Identifiant modèle OpenRouter ; par défaut openai/<OPENAI_CHAT_MODEL> (ex. openai/gpt-4o-mini). */
function resolveOpenRouterChatModelId() {
    const explicit = String(process.env.OPENROUTER_CHAT_MODEL || '').trim();
    if (explicit) return explicit;
    const openaiModel = String(process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini').trim();
    if (openaiModel.includes('/')) return openaiModel;
    return `openai/${openaiModel}`;
}

/**
 * Crée un ChatOpenAI — soit api.openai.com, soit OpenRouter (même schéma d’API).
 */
function createChatOpenAI({ streaming, maxTokens, temperature }) {
    const provider = resolveChatLlmProvider();
    const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();
    const routerKey = String(process.env.OPENROUTER_API_KEY || '').trim();
    const openaiModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

    if (provider === 'openrouter') {
        if (!routerKey) {
            console.warn(
                '[ChatService] OpenRouter demandé (CHAT_LLM_PROVIDER / CHAT_USE_OPENROUTER) mais OPENROUTER_API_KEY est vide — repli sur OpenAI direct.'
            );
            return new ChatOpenAI({
                apiKey: openaiKey,
                model: openaiModel,
                temperature,
                maxTokens,
                streaming,
            });
        }
        const model = resolveOpenRouterChatModelId();
        if (!chatOpenRouterLogged) {
            console.info(`[ChatService] LLM chat via OpenRouter (model=${model}).`);
            chatOpenRouterLogged = true;
        }
        return new ChatOpenAI({
            apiKey: routerKey,
            model,
            temperature,
            maxTokens,
            streaming,
            configuration: {
                baseURL: OPENROUTER_CHAT_BASE_URL,
                defaultHeaders: {
                    'HTTP-Referer':
                        process.env.OPENROUTER_HTTP_REFERER || process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
                    'X-Title': process.env.OPENROUTER_APP_TITLE || 'Pharma Vocal Agent',
                },
            },
        });
    }

    return new ChatOpenAI({
        apiKey: openaiKey,
        model: openaiModel,
        temperature,
        maxTokens,
        streaming,
    });
}

class ChatService {
    constructor(sttProvider = null, ttsProvider = null) {
        this.sttProvider = sttProvider;
        this.ttsProvider = ttsProvider;
        this.llm = createChatOpenAI({
            temperature: 0.1,
            // Keep enough headroom to avoid hard truncation mid-sentence.
            maxTokens: Number(process.env.OPENAI_CHAT_MAX_TOKENS || 420),
            streaming: true,
        });
        this.resourceRouterLlm = createChatOpenAI({
            temperature: 0,
            maxTokens: 80,
            streaming: false,
        });
        this.promptTemplate = ChatPromptTemplate.fromMessages([
            ['system', '{systemPrompt}'],
            new MessagesPlaceholder('history'),
            ['human', '{question}'],
        ]);
    }

    async getRagContext(question, avatarId, hints = []) {
        try {
            const useHistoryHints = ['1', 'true', 'yes'].includes(String(process.env.RAG_USE_HISTORY_HINTS || '').toLowerCase());
            const query = useHistoryHints
                ? [String(question || '').trim(), ...hints.map((h) => String(h || '').trim()).filter(Boolean)].join(' \n ')
                : String(question || '').trim();
            if (!query) return null;

            const topK = Number(process.env.RAG_TOP_K || 10);
            const normalizedQuery = query
                .replace(/\s*[-/|]+\s*/g, ' et ')
                .replace(/[^\p{L}\p{N}\s]/gu, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            let docs = await vectorStoreService.search(query, topK, undefined, avatarId);
            if ((!Array.isArray(docs) || !docs.length) && normalizedQuery && normalizedQuery !== query) {
                docs = await vectorStoreService.search(normalizedQuery, topK, undefined, avatarId);
            }
            if (!Array.isArray(docs) || !docs.length) {
                const configuredMode = String(process.env.RAG_RETRIEVAL_MODE || 'mmr').toLowerCase();
                const alternateMode = configuredMode === 'mmr' ? 'similarity' : 'mmr';
                docs = await vectorStoreService.search(query, topK, undefined, avatarId, { mode: alternateMode });
                if ((!Array.isArray(docs) || !docs.length) && normalizedQuery && normalizedQuery !== query) {
                    docs = await vectorStoreService.search(normalizedQuery, topK, undefined, avatarId, { mode: alternateMode });
                }
            }
            if (!Array.isArray(docs) || !docs.length) return null;

            return `CONTEXTE DOCUMENTAIRE :\n${docs.slice(0, 10).map((d, i) => `[Source ${i + 1}] ${d.pageContent}`).join('\n\n')}`;
        } catch (e) { return null; }
    }

    extractDbKeywords(question) {
        const stop = new Set([
            'bonjour', 'bonsoir', 'salut', 'merci', 'svp', 'stp', 'avec', 'sans', 'dans', 'pour', 'quoi',
            'comment', 'quand', 'qui', 'que', 'quel', 'quelle', 'quelles', 'quels', 'est', 'sont', 'ete',
            'etre', 'avoir', 'faire', 'pouvoir', 'vouloir', 'de', 'du', 'des', 'la', 'le', 'les', 'un',
            'une', 'et', 'ou', 'au', 'aux', 'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta',
            'tes', 'son', 'sa', 'ses', 'nous', 'vous', 'ils', 'elles', 'je', 'tu', 'il', 'elle', 'on'
        ]);
        return String(question || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .map((w) => w.trim())
            .filter((w) => w.length >= 3 && !stop.has(w))
            .slice(0, 5);
    }

    async getDbContext(question, avatarId) {
        try {
            const avatarNumeric = Number(avatarId);
            if (!Number.isFinite(avatarNumeric) || avatarNumeric <= 0) return null;

            const [schemas] = await connection.query(
                `SELECT id, table_name, original_filename, schema_json
                 FROM excel_schemas
                 WHERE avatar_id = ?
                 ORDER BY created_at DESC
                 LIMIT 3`,
                [avatarNumeric]
            );
            if (!Array.isArray(schemas) || !schemas.length) return null;

            const keywords = this.extractDbKeywords(question);
            const sections = [];

            for (const schema of schemas) {
                const tableName = String(schema?.table_name || '').trim();
                if (!/^excel_\d+_\d+$/i.test(tableName)) continue;

                let columns = [];
                try {
                    const parsed = JSON.parse(schema?.schema_json || '{}');
                    columns = Array.isArray(parsed?.colonnes)
                        ? parsed.colonnes.map((c) => String(c?.nom || '').trim()).filter(Boolean)
                        : [];
                } catch (_) {
                    columns = [];
                }

                const safeCols = columns
                    .map((name) => String(name).replace(/`/g, '').trim())
                    .filter(Boolean)
                    .slice(0, 20);
                if (!safeCols.length) continue;

                const colExpr = safeCols.map((c) => `\`${c}\``).join(', ');
                const whereParts = keywords.map(() => `LOWER(CONCAT_WS(' ', ${colExpr})) LIKE ?`);
                const whereClause = whereParts.length ? `WHERE ${whereParts.join(' OR ')}` : '';
                const params = whereParts.length ? keywords.map((k) => `%${k.toLowerCase()}%`) : [];

                const sql = `
                    SELECT * FROM \`${tableName}\`
                    ${whereClause}
                    LIMIT 5
                `;

                let rows = [];
                try {
                    const [res] = await connection.query(sql, params);
                    rows = Array.isArray(res) ? res : [];
                } catch (_) {
                    // Fallback: lire quelques lignes sans filtre si la requête filtrée échoue.
                    const [resFallback] = await connection.query(
                        `SELECT * FROM \`${tableName}\` LIMIT 5`
                    );
                    rows = Array.isArray(resFallback) ? resFallback : [];
                }
                if (!rows.length) continue;

                const compactRows = rows.map((r) => {
                    const out = {};
                    safeCols.slice(0, 8).forEach((k) => {
                        const v = r[k];
                        if (v !== null && v !== undefined && String(v).trim() !== '') {
                            out[k] = String(v).slice(0, 120);
                        }
                    });
                    return out;
                });

                sections.push(
                    `Table: ${tableName} (fichier: ${schema?.original_filename || 'Excel'})\n` +
                    compactRows.map((row, idx) => `[Ligne ${idx + 1}] ${JSON.stringify(row)}`).join('\n')
                );
            }

            if (!sections.length) return null;
            return `CONTEXTE BASE DE DONNÉES (Excel importés) :\n${sections.join('\n\n')}`;
        } catch (_) {
            return null;
        }
    }

    buildTemporalGuardrail() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const isoDate = now.toISOString().slice(0, 10);
        return [
            'CONTRAINTE TEMPORELLE (PRIORITAIRE) :',
            `- Date actuelle du serveur: ${isoDate} (année ${currentYear}).`,
            '- Si l’utilisateur demande l’année actuelle, réponds avec cette année.',
            "- N'invente jamais une date précise de match/événement si elle n'est pas certaine.",
            "- Si la date exacte n'est pas disponible dans le contexte, dis clairement que la date n'est pas confirmée."
        ].join('\n');
    }

    buildConversationFallback(rawHistory = [], ragMissingReply = '', noResourceReply = '') {
        const blocked = new Set([
            String(ragMissingReply || '').trim(),
            String(noResourceReply || '').trim(),
        ]);
        const recentAssistantFacts = rawHistory
            .filter((m) => String(m?.auteur || '').toLowerCase() === 'assistant')
            .map((m) => String(m?.transcription_texte || '').trim())
            .filter((t) => t && !blocked.has(t))
            .slice(-4);
        if (!recentAssistantFacts.length) return null;
        return `CONTEXTE CONVERSATIONNEL RÉCENT :\n${recentAssistantFacts.map((t, i) => `[Fait ${i + 1}] ${t}`).join('\n\n')}`;
    }

    getEnabledResources(session) {
        const ragEnabled = Number(session?.use_rag) === 1;
        const dbEnabled = Number(session?.use_db) === 1;
        const knowledgeEnabled = Number(session?.use_knowledge) === 1;
        return { ragEnabled, dbEnabled, knowledgeEnabled };
    }

    resolveManualResourcePriority(session, enabledKeys = []) {
        const base = ['rag', 'db', 'knowledge'];
        const rankingRaw = String(session?.resource_ranking || '').trim();
        if (!rankingRaw) {
            return base.filter((k) => enabledKeys.includes(k));
        }
        const parsed = rankingRaw
            .split(',')
            .map((s) => String(s || '').trim().toLowerCase())
            .filter(Boolean);
        const seen = new Set();
        const ordered = [];
        parsed.forEach((k) => {
            if (!base.includes(k) || seen.has(k) || !enabledKeys.includes(k)) return;
            seen.add(k);
            ordered.push(k);
        });
        base.forEach((k) => {
            if (enabledKeys.includes(k) && !seen.has(k)) ordered.push(k);
        });
        return ordered;
    }

    async resolveAgenticResourcePriority(question, session, enabledKeys = []) {
        const base = ['rag', 'db', 'knowledge'];
        const enabled = base.filter((k) => enabledKeys.includes(k));
        if (enabled.length <= 1) return enabled;

        const labelByKey = {
            rag: 'Recherche RAG: documents uploadés PDF/DOC/TXT, sources longues non structurées.',
            db: 'Base de données SQL: fichiers Excel importés, données tabulaires, chiffres, lignes, colonnes, prix, stocks, listes.',
            knowledge: 'Connaissance Générale: savoir interne du modèle LLM, définitions générales, explications hors documents.'
        };

        const prompt = [
            'Tu es un routeur de ressources LangChain pour un agent conversationnel.',
            'Classe les ressources activées par ordre de priorité pour répondre à la question utilisateur.',
            'Règles:',
            '- Si la question parle de données Excel, tableaux, chiffres, colonnes, filtres, listes, prix, stock, quantité: priorise db.',
            '- Si la question demande du contenu de documents uploadés, politiques, PDF, procédures, sources: priorise rag.',
            '- Si la question est générale ou conceptuelle et knowledge est activé: knowledge peut compléter ou passer en premier.',
            '- Réponds uniquement en JSON valide, exactement sous la forme: {"order":["db","rag","knowledge"]}.',
            '- Ne mets que les clés activées.',
            '',
            `Ressources activées: ${enabled.map((k) => `${k}=${labelByKey[k]}`).join(' | ')}`,
            `Nom agent: ${session?.nom_avatar || 'Agent'}`,
            `Question: ${String(question || '').slice(0, 800)}`
        ].join('\n');

        try {
            const response = await this.resourceRouterLlm.invoke([new HumanMessage(prompt)]);
            const raw = String(response?.content || '').trim();
            const match = raw.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(match ? match[0] : raw);
            const order = Array.isArray(parsed?.order) ? parsed.order : [];
            const seen = new Set();
            const valid = order
                .map((k) => String(k || '').trim().toLowerCase())
                .filter((k) => enabled.includes(k) && !seen.has(k) && seen.add(k));
            enabled.forEach((k) => {
                if (!seen.has(k)) valid.push(k);
            });
            return valid.length ? valid : enabled;
        } catch (err) {
            console.warn('[ChatService] Resource router fallback:', err?.message || err);
            return enabled;
        }
    }

    async resolveResourcePriority(question, session, enabledKeys = []) {
        if (Number(session?.manual_ranking) === 1) {
            return this.resolveManualResourcePriority(session, enabledKeys);
        }
        const routerMode = String(process.env.RESOURCE_ROUTER_MODE || 'manual').trim().toLowerCase();
        if (routerMode !== 'agentic') {
            return this.resolveManualResourcePriority(session, enabledKeys);
        }
        return this.resolveAgenticResourcePriority(question, session, enabledKeys);
    }

    async processMessageStream(dtoOrSessionId, message = null) {
        let sessionId, userMessage;
        if (typeof dtoOrSessionId === 'object' && dtoOrSessionId !== null) {
            sessionId = dtoOrSessionId.sessionId;
            userMessage = String(dtoOrSessionId.message || '');
        } else {
            sessionId = dtoOrSessionId;
            userMessage = String(message || '');
        }

        const sessionRepository = require('../repositories/sessionRepository');
        const saveUserMessagePromise = messageAssistanceRepository
            .saveMessage({ session_id: sessionId, auteur: 'utilisateur', transcription_texte: userMessage })
            .catch((err) => console.warn('[ChatService] Save user message async:', err?.message || err));
        const [session, rawHistory] = await Promise.all([
            sessionRepository.findById(sessionId),
            messageAssistanceRepository.getHistory(sessionId),
        ]);
        if (!session) throw new Error("Session introuvable");

        const roleplayHeader = `TU ES "${session.nom_avatar}". Oublie que tu es une IA. Tes instructions : ${session.prompt_systeme}.`;
        const languageGuardrail = [
            'CONTRAINTE DE LANGUE (PRIORITAIRE) :',
            "- Réponds dans la même langue que le dernier message de l'utilisateur.",
            "- Langues supportées: français, anglais, arabe, Darija marocaine, espagnol, italien et mélanges naturels.",
            "- Si l'utilisateur parle en Darija marocaine (arabe dialectal marocain, même écrit en alphabet latin), réponds en Darija marocaine naturelle.",
            "- Si l'utilisateur mélange plusieurs langues, réponds principalement dans la langue dominante et garde le même style de mélange si c'est naturel.",
            "- Ne force jamais le français sauf si l'utilisateur parle français ou le demande explicitement.",
            '- Réponse courte: 1 à 2 phrases maximum, concise et directe.',
            "- Maximum 70 mots au total.",
            "- Interdit: listes numérotées, puces, titres, markdown."
        ].join('\n');
        const temporalGuardrail = this.buildTemporalGuardrail();

        saveUserMessagePromise.catch(() => {});
        const { ragEnabled, dbEnabled, knowledgeEnabled } = this.getEnabledResources(session);
        const enabledResourceKeys = ['rag', 'db', 'knowledge'].filter((k) => ({
            rag: ragEnabled,
            db: dbEnabled,
            knowledge: knowledgeEnabled,
        })[k]);
        const resourcePriority = await this.resolveResourcePriority(userMessage, session, enabledResourceKeys);
        const recentUserHints = ragEnabled
            ? rawHistory
                .filter((m) => String(m?.auteur || '').toLowerCase() === 'utilisateur')
                .slice(-4)
                .map((m) => String(m?.transcription_texte || '').trim())
                .filter(Boolean)
            : [];
        let [ragContext, dbContext] = await Promise.all([
            ragEnabled ? this.getRagContext(userMessage, session.avatar_id, recentUserHints) : Promise.resolve(null),
            dbEnabled ? this.getDbContext(userMessage, session.avatar_id) : Promise.resolve(null),
        ]);

        const noResourceReply = "Désolé, je ne peux pas vous répondre car aucune ressource n'est activée.";
        const ragMissingReply = "Désolé, je ne peux pas répondre à cette question car l'information n'est pas présente dans vos documents RAG.";
        const dbMissingReply = "Désolé, je ne trouve pas cette information dans les fichiers Excel importés pour cet agent.";
        const ragDbMissingReply = "Désolé, je ne trouve pas cette information dans vos documents RAG ni dans les fichiers Excel importés.";
        const conversationFallback = this.buildConversationFallback(rawHistory, ragMissingReply, noResourceReply);
        if (!ragContext && conversationFallback) {
            ragContext = conversationFallback;
        }

        const resourceContexts = {
            rag: ragContext,
            db: dbContext,
        };
        const activeContextKeysOrdered = resourcePriority
            .filter((k) => k !== 'knowledge')
            .filter((k) => Boolean(resourceContexts[k]));
        const missingContextKeysOrdered = resourcePriority
            .filter((k) => k !== 'knowledge')
            .filter((k) => !resourceContexts[k]);
        const blockLabelByKey = {
            rag: 'CONTEXTE DOCUMENTAIRE (RAG)',
            db: 'CONTEXTE BASE DE DONNÉES (Excel importés)',
        };
        const blockBodyByKey = {
            rag: ragContext,
            db: dbContext,
        };
        const resourceBlocks = activeContextKeysOrdered
            .map((k) => {
                const body = String(blockBodyByKey[k] || '').trim();
                if (!body) return '';
                if (body.startsWith('CONTEXTE ')) return body;
                return `${blockLabelByKey[k]} :\n${body}`;
            })
            .filter(Boolean)
            .join('\n\n');

        // Hard guardrail: when general knowledge is disabled, NEVER answer outside enabled local resources (RAG/DB).
        if (!knowledgeEnabled) {
            if (!ragEnabled && !dbEnabled) {
                async function* singleTokenReply() {
                    await messageAssistanceRepository.saveMessage({
                        session_id: sessionId,
                        auteur: 'assistant',
                        transcription_texte: noResourceReply
                    });
                    yield { choices: [{ delta: { content: noResourceReply } }] };
                }
                return singleTokenReply();
            }
            if (!resourceBlocks) {
                const strictNoCtxReply = ragEnabled && dbEnabled
                    ? ragDbMissingReply
                    : ragEnabled
                        ? ragMissingReply
                        : dbMissingReply;
                async function* singleTokenReply() {
                    await messageAssistanceRepository.saveMessage({
                        session_id: sessionId,
                        auteur: 'assistant',
                        transcription_texte: strictNoCtxReply
                    });
                    yield { choices: [{ delta: { content: strictNoCtxReply } }] };
                }
                return singleTokenReply();
            }
        }

        let finalSystemPrompt = "";
        if (resourceBlocks && !knowledgeEnabled) {
            finalSystemPrompt = `${roleplayHeader}\n\n${languageGuardrail}\n\n${temporalGuardrail}\n\n${resourceBlocks}\n\nRESSOURCES ACTIVÉES (ordre de priorité): ${resourcePriority.join(' > ')}.\nCONSIGNE STRICTE :\n- Réponds UNIQUEMENT avec les informations présentes dans les ressources actives ci-dessus.\n- Interdiction d'utiliser des connaissances externes.\n- Si une partie de la question n'est pas trouvée dans une ressource, indique-le explicitement.\n- Ressources actives sans résultat pour cette question: ${missingContextKeysOrdered.join(', ') || 'aucune'}.\n- Réponds EXACTEMENT "${ragDbMissingReply}" seulement si AUCUN élément de la question n'est présent dans les ressources actives.`;
        } else if (resourceBlocks && knowledgeEnabled) {
            finalSystemPrompt = `${roleplayHeader}\n\n${languageGuardrail}\n\n${temporalGuardrail}\n\n${resourceBlocks}\n\nRESSOURCES ACTIVÉES (ordre de priorité): ${resourcePriority.join(' > ')}.\nUtilise d'abord les ressources locales ci-dessus (RAG/DB) selon cet ordre. Si une info manque, complète avec tes connaissances générales.`;
        } else if (knowledgeEnabled) {
            finalSystemPrompt = `${roleplayHeader}\n\n${languageGuardrail}\n\n${temporalGuardrail}\n\nRESSOURCES ACTIVÉES (ordre de priorité): ${resourcePriority.join(' > ')}.\nTu peux utiliser tes connaissances mondiales pour répondre.`;
        } else {
            finalSystemPrompt = `${languageGuardrail}\n\n${temporalGuardrail}\n\nRéponds EXACTEMENT : "${noResourceReply}"`;
        }

        const history = rawHistory.map(m => m.auteur === 'assistant' ? new AIMessage(m.transcription_texte) : new HumanMessage(m.transcription_texte));
        if (history.length > 0 && history[history.length - 1].content === userMessage) history.pop();

        const formatted = await this.promptTemplate.formatMessages({ systemPrompt: finalSystemPrompt, history, question: userMessage });
        const stream = await this.llm.stream(formatted);

        async function* streamGenerator() {
            let fullText = "";
            for await (const chunk of stream) {
                const token = chunk.content || "";
                fullText += token;
                yield { choices: [{ delta: { content: token } }] };
            }
            if (fullText) {
                messageAssistanceRepository
                    .saveMessage({ session_id: sessionId, auteur: 'assistant', transcription_texte: fullText })
                    .catch((err) => console.warn('[ChatService] Save assistant message async:', err?.message || err));
                require('./avatarService').prepareAvatarSpeech(fullText).catch(() => {});
            }
        }
        return streamGenerator();
    }
}

module.exports = new ChatService();