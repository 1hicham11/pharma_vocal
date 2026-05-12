import os
import json
import pymysql
import re
from contextvars import ContextVar
import chromadb
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import Chroma
from langchain.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

# ═══════════════════════════════════════════════════════════════════════
# CONTEXTE THREAD-SAFE
# ═══════════════════════════════════════════════════════════════════════
current_avatar_id: ContextVar[Optional[int]] = ContextVar('current_avatar_id', default=None)
current_avatar_prompt: ContextVar[Optional[str]] = ContextVar('current_avatar_prompt', default=None)

# Configuration globale du LLM (pour les tâches d'évaluation)
llm = ChatOpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    model="gpt-4o",
    temperature=0
)

# ─────────────────────────────────────────────────────────────
# ETAPE 1 - RETRIEVAL
# ─────────────────────────────────────────────────────────────
def retrieve_documents(query: str, avatar_id: int) -> Dict[str, Any]:
    try:
        embeddings = OpenAIEmbeddings(
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            model="text-embedding-3-large"
        )
        collection_name = f"avatar_{avatar_id}"
        chroma_client = chromadb.HttpClient(host='localhost', port=8000)
        vectorstore = Chroma(
            client=chroma_client,
            collection_name=collection_name,
            embedding_function=embeddings
        )
        docs = vectorstore.similarity_search(query, k=5)
        if not docs:
            return {"docs": [], "raw_context": ""}
        structured_docs = []
        raw_context = ""
        for i, d in enumerate(docs):
            doc_id = i + 1
            content = d.page_content[:500]
            structured_docs.append({"id": doc_id, "content": content})
            raw_context += f"[Doc {doc_id}]\n{content}\n\n"
        return {"docs": structured_docs, "raw_context": raw_context.strip()}
    except Exception as e:
        print(f"[RAG:Retrieval] Erreur: {e}")
        return {"docs": [], "raw_context": ""}

# ─────────────────────────────────────────────────────────────
# ETAPE 2 - VALIDATION DE PERTINENCE
# ─────────────────────────────────────────────────────────────
def validate_context(query: str, context: str) -> bool:
    if not context:
        return False
    prompt = f"""Tu es un évaluateur strict. Vérifie si le contexte contient une réponse claire à la question.

Contexte :
{context}

Question : "{query}"

Réponds UNIQUEMENT par "OUI" ou "NON"."""
    try:
        response = llm.invoke([HumanMessage(content=prompt)]).content.strip().upper()
        return "OUI" in response
    except Exception as e:
        print(f"[RAG:Validation] Erreur: {e}")
        return False

# ─────────────────────────────────────────────────────────────
# ETAPE 3 - GÉNÉRATION STRICTE (JSON)
# ─────────────────────────────────────────────────────────────
def generate_strict_response(query: str, context: str, custom_prompt: str) -> str:
    system_instruction = f"""RÔLE :
{custom_prompt}

RÈGLES STRICTES ET INFRANGIBLES :
1. Tu es un système RAG. Tu ne dois utiliser QUE le contexte fourni.
2. Si la réponse est absente du contexte -> "found": false, "answer": ""
3. Si la réponse est présente -> réponds précisément, cite [Doc X].
4. INTERDICTION FORMELLE d'extrapoler, de deviner, ou d'utiliser tes connaissances générales.

FORMAT JSON OBLIGATOIRE : {{"found": boolean, "answer": "ta réponse"}}"""

    enforced_query = f"""CONTEXTE DISPONIBLE :
{context}

QUESTION DE L'UTILISATEUR (peut inclure l'historique) :
{query}

[RAPPEL SYSTEME OBLIGATOIRE] : Si la réponse à la dernière question ne se trouve pas dans le CONTEXTE DISPONIBLE, tu DOIS obligatoirement renvoyer "found": false et "answer": "". Ne propose jamais de réponse alternative."""

    try:
        llm_json = ChatOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            model="gpt-4o",
            temperature=0,
            model_kwargs={"response_format": {"type": "json_object"}}
        )
        messages = [
            SystemMessage(content=system_instruction),
            HumanMessage(content=enforced_query)
        ]
        return llm_json.invoke(messages).content
    except Exception as e:
        print(f"[RAG:Generation] Erreur: {e}")
        return '{"found": false, "answer": ""}'

# ─────────────────────────────────────────────────────────────
# VÉRIFICATIONS ANTI-HALLUCINATION
# ─────────────────────────────────────────────────────────────
def is_refusal(response: str) -> bool:
    refusal_keywords = [
        "je suis désolé", "je n'ai pas cette information", "je ne trouve pas",
        "le contexte ne contient pas", "ne mentionne pas", "je n'ai pas de recette"
    ]
    lower_resp = response.lower()
    return any(k in lower_resp for k in refusal_keywords)

def is_mixed_response(response: str) -> bool:
    if not is_refusal(response):
        return False
    forbidden_after = [
        "cependant", "mais", "voici", "par exemple", "je peux", "tu peux", "il existe"
    ]
    lower_resp = response.lower()
    if any(word in lower_resp for word in forbidden_after):
        return True
    sentences = [s.strip() for s in re.split(r'[.\n]', response) if len(s.strip()) > 3]
    return len(sentences) > 1

def answer_contains_unseen_content(answer: str, context: str) -> bool:
    suspicious_words = ["gâteau", "chocolat", "recette", "ingrédients", "préparation"]
    answer_lower = answer.lower()
    context_lower = context.lower()
    return any(word in answer_lower and word not in context_lower for word in suspicious_words)

def verify_response(query: str, context: str, generated_response: str) -> bool:
    prompt = f"""Tu es un auditeur strict. Vérifie que la réponse ne contient aucune information absente du contexte.

Contexte :
{context}

Question : "{query}"
Réponse : "{generated_response}"

Réponds UNIQUEMENT par "OUI" ou "NON"."""
    try:
        eval_response = llm.invoke([HumanMessage(content=prompt)]).content.strip().upper()
        return "OUI" in eval_response
    except Exception as e:
        print(f"[RAG:Verification] Erreur: {e}")
        return False

# ─────────────────────────────────────────────────────────────
# OUTILS
# ─────────────────────────────────────────────────────────────
@tool
def query_sql(question: str):
    """Utile pour interroger la base de données MySQL en langage naturel."""
    avatar_id = current_avatar_id.get()
    if not avatar_id:
        return "Erreur: avatar_id manquant"
    try:
        conn = pymysql.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", ""),
            database=os.getenv("DB_NAME", "pharma_vocal"),
            cursorclass=pymysql.cursors.DictCursor
        )
        with conn.cursor() as cursor:
            cursor.execute("SELECT table_name, schema_json FROM excel_schemas WHERE avatar_id = %s", (avatar_id,))
            schema_rows = cursor.fetchall()
            if not schema_rows:
                return f"Aucun schéma trouvé pour avatar_id={avatar_id}"
            schemas_context = "Schémas disponibles:\n"
            for row in schema_rows:
                table_name = row["table_name"]
                try:
                    schema = json.loads(row["schema_json"])
                    schemas_context += f"\n- Table {table_name}: {json.dumps(schema, indent=2)}"
                except:
                    schemas_context += f"\n- Table {table_name}: (schéma invalide)"
            llm_sql = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), model="gpt-4o-mini", temperature=0)
            prompt_text = f"""Question: "{question}"\nSchémas:\n{schemas_context}\nGénère une requête SQL SELECT valide, uniquement le SQL."""
            generated_sql = llm_sql.invoke([HumanMessage(content=prompt_text)]).content
            try:
                cursor.execute(generated_sql)
                results = cursor.fetchall()
                if not results:
                    return "La requête n'a retourné aucun résultat."
                result_text = f"Résultats ({len(results)} lignes):\n"
                for i, row in enumerate(results[:10]):
                    result_text += f"{i+1}. {dict(row)}\n"
                if len(results) > 10:
                    result_text += f"\n... et {len(results)-10} autres lignes"
                return result_text
            except Exception as exec_err:
                return f"Erreur exécution SQL: {exec_err}. Requête: {generated_sql}"
    except Exception as e:
        return f"Erreur requête SQL: {e}"
    finally:
        if 'conn' in locals():
            conn.close()

@tool
def general_knowledge(question: str):
    """Utile pour des questions de connaissance générale sans lien avec les documents de l'expert."""
    try:
        llm_gk = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), model="gpt-4o", temperature=0.7) 
        custom_prompt = current_avatar_prompt.get() or "Tu es un assistant expert."
        
        system_instruction = f"""RÔLE :
{custom_prompt}

INSTRUCTION ABSOLUE :
Tu es en mode "Connaissance Générale". Tu DOIS utiliser tes connaissances mondiales pour répondre.
Si l'utilisateur pose une question, réponds-y directement comme l'expert que tu es.
Même si dans l'historique de la conversation tu as parlé de "contexte documentaire" ou de "limites", c'est FINI. Tu es maintenant libre de donner n'importe quelle information.
NE MENTIONNE JAMAIS le mot "contexte", "document" ou tes limites précédentes."""

        messages = [
            SystemMessage(content=system_instruction),
            HumanMessage(content=question)
        ]
        
        return llm_gk.invoke(messages).content
    except Exception as e:
        return f"Erreur génération réponse: {e}"

# ─────────────────────────────────────────────────────────────
# PIPELINE RAG
# ─────────────────────────────────────────────────────────────
def run_rag_pipeline(query: str, avatar_id: int, custom_prompt: str) -> Dict[str, Any]:
    default_refusal = "Je suis désolé, mais je n'ai pas cette information dans mes documents."
    retrieval_data = retrieve_documents(query, avatar_id)
    context = retrieval_data["raw_context"]
    if not context:
        return {"response": default_refusal, "confidence": False, "docs": []}
    if not validate_context(query, context):
        return {"response": default_refusal, "confidence": False, "docs": retrieval_data["docs"]}
    json_response_str = generate_strict_response(query, context, custom_prompt)
    try:
        parsed_response = json.loads(json_response_str)
        if not parsed_response.get("found", False):
            return {"response": default_refusal, "confidence": False, "docs": retrieval_data["docs"]}
        generated_answer = parsed_response.get("answer", "")
        if is_refusal(generated_answer) or is_mixed_response(generated_answer) or answer_contains_unseen_content(generated_answer, context):
            return {"response": default_refusal, "confidence": False, "docs": retrieval_data["docs"]}
    except:
        return {"response": default_refusal, "confidence": False, "docs": retrieval_data["docs"]}
    if not verify_response(query, context, generated_answer):
        return {"response": default_refusal, "confidence": False, "docs": retrieval_data["docs"]}
    return {"response": generated_answer, "confidence": True, "docs": retrieval_data["docs"]}

# ═══════════════════════════════════════════════════════════════════════
# CHARGEMENT CONFIG AVATAR (MODIFIÉ - SOLUTION 1)
# ═══════════════════════════════════════════════════════════════════════
def load_avatar_config(avatar_id: int) -> Dict[str, Any]:
    """
    Charge depuis la DB la table principale AVATARS_ASSISTANTS 
    où les toggles sont directement enregistrés.
    """
    config = {
        "custom_prompt": "Tu es un assistant expert.",
        "use_rag": False,
        "use_db": False,
        "use_knowledge": False,
    }
    try:
        conn = pymysql.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", ""),
            database=os.getenv("DB_NAME", "pharma_vocal"),
            cursorclass=pymysql.cursors.DictCursor
        )
        with conn.cursor() as cursor:
            # On tape directement dans la table principale sans faire de JOIN
            cursor.execute("""
                SELECT prompt_systeme, use_rag, use_db, use_knowledge 
                FROM AVATARS_ASSISTANTS 
                WHERE id = %s
            """, (avatar_id,))
            row = cursor.fetchone()
            
            if row:
                if row.get("prompt_systeme"):
                    config["custom_prompt"] = row["prompt_systeme"]
                # On lit les booléens directement depuis les colonnes mises à jour par Node
                config["use_rag"]       = bool(row.get("use_rag", False))
                config["use_db"]        = bool(row.get("use_db", False))
                config["use_knowledge"] = bool(row.get("use_knowledge", False))
    except Exception as e:
        print(f"[Agent] Erreur chargement avatar {avatar_id}: {e}")
    finally:
        if 'conn' in locals() and conn.open:
            conn.close()
    return config

# ═══════════════════════════════════════════════════════════════════════
# AGENT PRINCIPAL
# ═══════════════════════════════════════════════════════════════════════
def run_agent(user_input: str, avatar_id: int) -> str:
    current_avatar_id.set(avatar_id)

    config = load_avatar_config(avatar_id)
    custom_prompt  = config["custom_prompt"]
    use_rag        = config["use_rag"]
    use_db         = config["use_db"]
    use_knowledge  = config["use_knowledge"]

    current_avatar_prompt.set(custom_prompt)

    print(
        f"[Agent] avatar={avatar_id} | "
        f"RAG={'ON' if use_rag else 'OFF'} | "
        f"SQL={'ON' if use_db else 'OFF'} | "
        f"Knowledge={'ON' if use_knowledge else 'OFF'}"
    )

    if use_rag:
        return run_rag_pipeline(user_input, avatar_id, custom_prompt)["response"]

    if use_db:
        return query_sql(user_input)

    if use_knowledge:
        return general_knowledge(user_input)

    return (
        "Aucune ressource n'est activée pour cet assistant. "
        "Veuillez activer au moins une ressource dans les paramètres."
    )