const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const axios = require('axios');
const OpenAI = require('openai');
const FormData = require('form-data');
const { randomUUID, createHash } = require('crypto');

/**
 * L'endpoint OpenAI `images.edit` n'accepte que le modèle `dall-e-2`.
 * gpt-image-1 / gpt-image-1.5 → utiliser `images.generate` (référence image en option).
 */
function resolveMascotEditModel() {
    const raw = String(process.env.OPENAI_MASCOT_EDIT_MODEL || '').trim();
    if (!raw) return '';
    if (raw.toLowerCase() === 'dall-e-2') return 'dall-e-2';
    console.warn(
        `[MascotService] OPENAI_MASCOT_EDIT_MODEL="${raw}" n'est pas valide pour images.edit (seul dall-e-2). ` +
            'Les variantes mascotte passeront par images.generate. Pour img2img DALL·E 2 : OPENAI_MASCOT_EDIT_MODEL=dall-e-2 ; sinon laissez vide.'
    );
    return '';
}

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1';
const REPLICATE_API_BASE_URL = 'https://api.replicate.com/v1';
const PIXVERSE_API_BASE_URL = process.env.PIXVERSE_API_BASE_URL || 'https://app-api.pixverse.ai';
const DEFAULT_IMAGE_MODEL = process.env.OPENAI_MASCOT_IMAGE_MODEL || 'gpt-image-1.5';
const DEFAULT_OPENROUTER_MASCOT_MODEL = process.env.OPENROUTER_MASCOT_MODEL || 'google/gemini-3.1-flash-image-preview';

/**
 * Modèle Replicate multimodal (image+texte → image) utilisé pour la feuille sprite quand un portrait
 * de référence est fourni.
 * Doc : https://replicate.com/openai/gpt-image-2
 */
const MASCOT_REPLICATE_MODEL = String(process.env.MASCOT_REPLICATE_MODEL || 'openai/gpt-image-2').trim();
/** Active le chemin Replicate multimodal en priorité quand un portrait de référence est fourni (1=oui par défaut). */
const MASCOT_REPLICATE_PRIMARY = String(process.env.MASCOT_REPLICATE_PRIMARY ?? '1') !== '0';
const MASCOT_REPLICATE_QUALITY = (() => {
    const raw = String(process.env.MASCOT_REPLICATE_QUALITY || 'medium').trim().toLowerCase();
    return ['low', 'medium', 'high', 'auto'].includes(raw) ? raw : 'high';
})();
const MASCOT_REPLICATE_POLL_INTERVAL_MS = Math.max(1000, Number(process.env.MASCOT_REPLICATE_POLL_INTERVAL_MS || 2000));
const MASCOT_REPLICATE_TIMEOUT_MS = Math.max(30000, Number(process.env.MASCOT_REPLICATE_TIMEOUT_MS || 180000));
const DEFAULT_PIXVERSE_VIDEO_MODEL = process.env.PIXVERSE_VIDEO_MODEL || 'v6';
const DEFAULT_PIXVERSE_VIDEO_DURATION = Number(process.env.PIXVERSE_VIDEO_DURATION || 5);
const PUBLIC_AVATAR_ROOT = '/assets/avatars/generated';
const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_MASCOT_REQUEST_TIMEOUT_MS || 90000);
const IMAGE_DOWNLOAD_TIMEOUT_MS = Number(process.env.MASCOT_IMAGE_DOWNLOAD_TIMEOUT_MS || 45000);
const MASCOT_RETRY_ATTEMPTS = Number(process.env.OPENAI_MASCOT_RETRY_ATTEMPTS || 3);
const MASCOT_RETRY_DELAY_MS = Number(process.env.OPENAI_MASCOT_RETRY_DELAY_MS || 1200);
const OPENAI_MASCOT_EDIT_MODEL = resolveMascotEditModel();
const MASCOT_STRICT_IDENTITY_MODE = String(process.env.OPENAI_MASCOT_STRICT_IDENTITY_MODE || '1') !== '0';
const MASCOT_STRICT_RETRIES = Math.max(1, Number(process.env.OPENAI_MASCOT_STRICT_RETRIES || 3));
const ALLOWED_OPENAI_IMAGE_MODELS = new Set(['gpt-image-1.5', 'gpt-image-1', 'chatgpt-images', 'latest']);
/** Taille cible (px) de chaque pose après normalisation — plus haut = plus net à l’écran à taille d’affichage identique (le client ne change pas son zoom / clip). */
const MASCOT_SPRITE_CELL_MAX = Math.max(64, Math.min(2048, Number(process.env.MASCOT_SPRITE_CELL_MAX || 1024)));
const MASCOT_SPRITE_SHEET_NAME = 'sprite-sheet.png';
/** Texte libre ajouté à chaque prompt (optionnel). */
const MASCOT_EXTRA_PROMPT = String(process.env.MASCOT_EXTRA_PROMPT || '').trim();
/**
 * Feuille monolithique : 1 appel `images.generate` puis découpe (une seule génération pour toutes les poses).
 * Chaîne par pose : 1 appel par visème, disponible uniquement si MASCOT_MONOLITH_SHEET=0.
 * Env : MASCOT_MONOLITH_SHEET=1 force la feuille unique ; =0 force la chaîne. Si absent : feuille unique.
 */
function shouldUseMonolithSheet(/* provider */) {
    const raw = process.env.MASCOT_MONOLITH_SHEET;
    if (raw !== undefined && String(raw).trim() !== '') {
        return String(raw).trim() !== '0';
    }
    return true;
}
/**
 * OpenRouter : l’endpoint `images.generate` peut ignorer le fichier `image` (pas d’img2img fiable).
 * On force donc la feuille unique par défaut pour respecter une seule génération.
 * Désactiver explicitement : MASCOT_OPENROUTER_FORCE_MONOLITH=0
 */
const MASCOT_OPENROUTER_FORCE_MONOLITH = String(process.env.MASCOT_OPENROUTER_FORCE_MONOLITH ?? '1') !== '0';
/** Si une pose est strictement identique (bytes) à la précédente, on regénère avec un prompt renforcé. */
const MASCOT_DUPLICATE_POSE_RETRIES = Math.max(1, Math.min(8, Number(process.env.MASCOT_DUPLICATE_POSE_RETRIES || 4)));

/** Tailles supportées par l’API Images GPT (pas de 1536×1536 carré). */
const VALID_GPT_IMAGE_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);

/** Qualité de rendu GPT Image : low | medium | high | auto (défaut high — fort impact sur le détail). */
const OPENAI_MASCOT_IMAGE_QUALITY_RAW = String(process.env.OPENAI_MASCOT_IMAGE_QUALITY || 'high').trim().toLowerCase();
const OPENAI_MASCOT_IMAGE_QUALITY = ['low', 'medium', 'high', 'auto'].includes(OPENAI_MASCOT_IMAGE_QUALITY_RAW)
    ? OPENAI_MASCOT_IMAGE_QUALITY_RAW
    : 'high';

/** Après téléchargement de la feuille monolithique : facteur Lanczos (>1) avant découpe. Désactivé par défaut car coûteux sur les grandes feuilles. */
const MASCOT_SPRITE_SHEET_UPSCALE = Math.min(4, Math.max(1, Number(process.env.MASCOT_SPRITE_SHEET_UPSCALE || 1)));
/** Rogne chaque case lors du découpage (px par bord) pour retirer les traits noirs de grille souvent dessinés par l’IA. */
const MASCOT_SPRITE_SLICE_GRID_TRIM = Math.max(0, Math.min(20, Number(process.env.MASCOT_SPRITE_SLICE_GRID_TRIM || 14)));
/** Après trim grille : rogner encore chaque case (facteur < 1) pour retirer les bords voisins souvent dessinés par l’IA. 1 = désactivé. */
const MASCOT_MONOLITH_CELL_SHRINK = Math.min(1, Math.max(0.5, Number(process.env.MASCOT_MONOLITH_CELL_SHRINK || 1)));
/**
 * Stabilisation anti-tremblement : pour chaque pose découpée, trim auto du fond uniforme puis ré-encadrement
 * centré dans une fenêtre fixe (en proportion de la cellule). En théorie utile pour stabiliser la grille,
 * mais EN PRATIQUE sur une grande feuille où certaines cellules sont mal cadrées par le modèle (chin coupé,
 * ou bust placé haut), le trim amplifie l'incohérence (zoom dans la zone yeux uniquement).
 * Défaut = 0 (désactivé). À activer (=1) seulement si vous savez que toutes les cellules sont parfaitement cadrées.
 */
const MASCOT_POSE_AUTO_RECENTER = String(process.env.MASCOT_POSE_AUTO_RECENTER ?? '0') !== '0';
/** Proportion (0..1) de la case occupée par le contenu après recentrage. 0.84 = 84%, marge de 8% partout. */
const MASCOT_POSE_CONTENT_FRACTION = Math.min(0.98, Math.max(0.5, Number(process.env.MASCOT_POSE_CONTENT_FRACTION || 0.86)));
/** Tolérance de la détection du fond pour le trim auto (différence couleur). Augmenter si le trim coupe trop, baisser si le fond reste visible. */
const MASCOT_POSE_TRIM_THRESHOLD = Math.max(5, Math.min(80, Number(process.env.MASCOT_POSE_TRIM_THRESHOLD || 28)));

/**
 * Grille feuille mascotte : nombre de colonnes/lignes (et donc de poses générées).
 * Défaut 7×7 = 49 visèmes (variantes de bouche).
 * Surcharger via MASCOT_GRID_COLS / MASCOT_GRID_ROWS si besoin (ex. 4×4 = 16 ou 8×8 = 64).
 * Bornes 2..12 pour éviter une grille trop fine que l’IA n’arrive plus à rendre proprement.
 */
const MASCOT_GRID_COLS = Math.max(2, Math.min(12, Number(process.env.MASCOT_GRID_COLS || 7)));
const MASCOT_GRID_ROWS = Math.max(2, Math.min(12, Number(process.env.MASCOT_GRID_ROWS || 7)));
const MASCOT_GRID_FRAMES = MASCOT_GRID_COLS * MASCOT_GRID_ROWS;
const MASCOT_CANDIDATE_COUNT = Math.max(1, Math.min(6, Number(process.env.MASCOT_CANDIDATE_COUNT || 3)));
const MASCOT_CANDIDATE_DIR_NAME = 'candidates';

function getMonolithSizeCandidates() {
    const raw = String(process.env.MASCOT_MONOLITH_SIZE || '').trim();
    const fallback = ['1024x1024'];
    if (raw) {
        const parts = raw.split(/[\s,]+/).filter(Boolean);
        const ok = parts.filter((s) => VALID_GPT_IMAGE_SIZES.has(s));
        if (ok.length) return ok;
        console.warn(
            '[MascotService] MASCOT_MONOLITH_SIZE ignoré (utiliser 1024x1024, 1024x1536 ou 1536x1024 selon l’API OpenAI). Défaut 1024x1024.'
        );
    }
    return fallback;
}

function isGptImageModel(model) {
    const m = String(model || '').trim().toLowerCase();
    if (!m) return false;
    if (m.startsWith('gpt-image')) return true;
    return m === 'chatgpt-images' || m === 'latest';
}

/**
 * Qualité API réservée aux modèles GPT Image sur le provider OpenAI direct (évite erreurs OpenRouter).
 */
function applyGptImageGenerateParams(payload, model, provider) {
    if (provider !== 'openai' || !isGptImageModel(model)) return payload;
    return { ...payload, quality: OPENAI_MASCOT_IMAGE_QUALITY };
}

/**
 * Taille API pour une pose buste : plus de pixels en entrée → meilleure netteté après normalisation carrée.
 * OpenRouter / autres : rester sur 1024×1024 si non surchargé par MASCOT_POSE_IMAGE_SIZE.
 */
function resolvePoseGenerationSize(provider, model) {
    const raw = String(process.env.MASCOT_POSE_IMAGE_SIZE || '').trim().toLowerCase();
    if (raw && VALID_GPT_IMAGE_SIZES.has(raw)) return raw;
    /* On force du carré 1024×1024 par défaut : la pose normalisée côté serveur est carrée
       (MASCOT_SPRITE_CELL_MAX) et un format paysage 1536×1024 obligerait à letterboxer la moitié des pixels.
       Ceux qui veulent du paysage peuvent toujours passer MASCOT_POSE_IMAGE_SIZE=1536x1024. */
    return '1024x1024';
}

function getMascotOutputDir(numericAvatarId) {
    return path.join(getMascotGeneratedRoot(), `avatar-${numericAvatarId}`);
}

function getMascotGeneratedRoot() {
    return path.join(
        __dirname,
        '..',
        'public',
        'assets',
        'avatars',
        'generated'
    );
}

function getMascotCandidateDir(numericAvatarId) {
    return path.join(getMascotOutputDir(numericAvatarId), MASCOT_CANDIDATE_DIR_NAME);
}

function candidateFileName(index) {
    return `candidate-${String(index).padStart(2, '0')}.png`;
}

function candidatePublicUrl(numericAvatarId, index) {
    return `${PUBLIC_AVATAR_ROOT}/avatar-${numericAvatarId}/${MASCOT_CANDIDATE_DIR_NAME}/${candidateFileName(index)}`;
}

async function maybeUpscaleSpriteSheetBuffer(buffer) {
    const factor = MASCOT_SPRITE_SHEET_UPSCALE;
    if (!factor || factor <= 1) return buffer;
    let sharpMod;
    try {
        sharpMod = require('sharp');
    } catch (_) {
        return buffer;
    }
    const meta = await sharpMod(buffer).metadata();
    const w = Number(meta.width) || 0;
    const h = Number(meta.height) || 0;
    if (!w || !h) return buffer;
    const nw = Math.round(w * factor);
    const nh = Math.round(h * factor);
    return sharpMod(buffer)
        .resize(nw, nh, { kernel: sharpMod.kernel.lanczos3 })
        .png()
        .toBuffer();
}

/**
 * Toutes les poses PNG (génération unitaire ou découpe feuille) → même taille en pixels ET
 * MÊME emplacement du visage dans la case (anti-tremblement / anti-débordement sur la cellule voisine).
 *
 * Algorithme :
 *  1. (optionnel — défaut activé) `sharp.trim()` retire les bords uniformes de fond → rectangle serré sur le contenu.
 *  2. Resize "fit: inside" à `MASCOT_POSE_CONTENT_FRACTION × side` (~86% de la cellule).
 *  3. `extend` symétrique pour padder en carré `side × side` avec le même fond studio.
 *  → Toutes les poses ont alors le buste exactement centré, à la même échelle, encadré par la même
 *    marge homogène. Le lip-sync ne peut plus produire de translation de tête entre les frames.
 */
async function normalizeMascotPosePngToCellSize(absolutePath) {
    let sharpMod;
    try {
        sharpMod = require('sharp');
    } catch {
        return;
    }
    const side = MASCOT_SPRITE_CELL_MAX;
    const bg = { r: 46, g: 52, b: 64, alpha: 1 };
    try {
        const buf = await fs.readFile(absolutePath);

        let trimmedBuf = buf;
        if (MASCOT_POSE_AUTO_RECENTER) {
            try {
                trimmedBuf = await sharpMod(buf)
                    .trim({ background: bg, threshold: MASCOT_POSE_TRIM_THRESHOLD })
                    .toBuffer();
                const trimmedMeta = await sharpMod(trimmedBuf).metadata();
                /* Filet de sécurité : si le trim a tout coupé (image quasi vide / fond non détecté),
                   on revient à l'image source plutôt que de produire un sprite cassé. */
                if (!trimmedMeta.width || !trimmedMeta.height || trimmedMeta.width < 24 || trimmedMeta.height < 24) {
                    trimmedBuf = buf;
                }
            } catch (_trimErr) {
                trimmedBuf = buf;
            }
        }

        const innerSide = Math.max(64, Math.round(side * MASCOT_POSE_CONTENT_FRACTION));

        const resizedBuf = await sharpMod(trimmedBuf)
            .resize(innerSide, innerSide, {
                fit: 'inside',
                withoutEnlargement: false,
                kernel: sharpMod.kernel.lanczos3,
                background: bg,
            })
            .toBuffer();

        const resizedMeta = await sharpMod(resizedBuf).metadata();
        const rw = Number(resizedMeta.width) || innerSide;
        const rh = Number(resizedMeta.height) || innerSide;
        const padX = Math.max(0, Math.floor((side - rw) / 2));
        const padY = Math.max(0, Math.floor((side - rh) / 2));

        const out = await sharpMod(resizedBuf)
            .extend({
                top: padY,
                bottom: side - rh - padY,
                left: padX,
                right: side - rw - padX,
                background: bg,
            })
            .resize(side, side, { fit: 'cover', position: 'center', background: bg })
            .sharpen({ sigma: 0.95, m1: 1.2, m2: 0.6, x1: 2, y2: 10, y3: 20 })
            .png({ compressionLevel: 7, adaptiveFiltering: true })
            .toBuffer();
        await fs.writeFile(absolutePath, out);
    } catch (e) {
        console.warn('[MascotService] Normalisation dimensions pose ignorée:', absolutePath, e?.message || e);
    }
}

function resolveOpenAIImageModel(rawModel) {
    const model = String(rawModel || '').trim().toLowerCase();
    if (!model) return 'gpt-image-1.5';
    if (ALLOWED_OPENAI_IMAGE_MODELS.has(model)) {
        // Route aliases to the preferred latest image model.
        if (model === 'latest' || model === 'chatgpt-images') return 'gpt-image-1.5';
        return model;
    }
    return 'gpt-image-1.5';
}

/**
 * Modèles à essayer pour `images.generate` (feuille monolithique / image master).
 * Avec OpenRouter : ne pas enchaîner sur gpt-image-* (souvent routés comme usage OpenAI / erreurs de billing).
 * Repli optionnel : OPENROUTER_MASCOT_MODEL_FALLBACK (ex. autre slug OpenRouter).
 */
function resolveMascotImageModelCandidates(primaryModel, provider) {
    const p = String(provider || '').toLowerCase();
    if (p === 'openrouter') {
        const fb = String(process.env.OPENROUTER_MASCOT_MODEL_FALLBACK || '').trim();
        return Array.from(new Set([primaryModel, fb].filter(Boolean)));
    }
    return Array.from(new Set([primaryModel, 'gpt-image-1.5', 'gpt-image-1'].filter(Boolean)));
}

/**
 * Visèmes de référence (les 25 historiques 5×5).
 * Même cadrage buste / même personnage : seuls les visèmes (bouche) changent — pour lip-sync comme mascot.html + session (sprite CSS).
 * Les clés `idle_front` / `listen` / `explain` sont mappées par le client (visemeFrames côté session.html), il faut les garder.
 */
const BASE_MASCOT_POSES = [
    { key: 'idle_front', label: 'Neutre fermé', description: 'mouth fully relaxed, lips gently closed, neutral friendly expression (rest viseme)' },
    { key: 'phoneme_02', label: 'Léger entrouvert', description: 'lips slightly parted as if starting a soft consonant, minimal jaw drop' },
    { key: 'phoneme_03', label: 'Sourire fermé', description: 'closed-mouth warm smile, cheeks slightly raised, no teeth showing' },
    { key: 'phoneme_04', label: 'Dents légères', description: 'slight teeth reveal, closed relaxed jaw (soft “S” / “Z” type shape)' },
    { key: 'phoneme_05', label: 'Petit O', description: 'small rounded “O” lip shape, moderate jaw opening' },
    { key: 'phoneme_06', label: 'O arrondi', description: 'wider rounded “OH” mouth, jaw lowered evenly' },
    { key: 'phoneme_07', label: 'Grand Ah', description: 'wide open mouth vertically for “AH” vowel, natural speaking openness' },
    { key: 'listen', label: 'Écoute', description: 'mouth almost closed, attentive neutral lips; eyes engaged toward camera (listening viseme)' },
    { key: 'phoneme_09', label: 'E étiré', description: 'wide horizontal “EE” smile shape, teeth may show, spread lips' },
    { key: 'phoneme_10', label: 'F / V', description: 'lower lip lightly under upper teeth, gentle bite for F/V viseme' },
    { key: 'phoneme_11', label: 'Ou mi-voyelle', description: 'mid-open relaxed oval, neutral forward tongue position' },
    { key: 'phoneme_12', label: 'U serré', description: 'lips pursed forward small circle, “OO” protrusion' },
    { key: 'explain', label: 'Parole mi-ouverte', description: 'typical mid-speech mouth: relaxed open, neutral vowel (good default talking frame)' },
    { key: 'phoneme_14', label: 'Chute mâchoire', description: 'jaw dropped a bit more, soft open vowel, lips not wide' },
    { key: 'phoneme_15', label: 'Large sourire', description: 'broad smile with visible teeth, cheeks up, mouth moderately open' },
    { key: 'phoneme_16', label: 'Asymétrique', description: 'slight asymmetric mouth corners only (mid-word); eyes and head position identical to other cells; no head tilt' },
    { key: 'phoneme_17', label: 'Plosive avant', description: 'lips pressed together then just parting (before “P/B” release), crisp closure' },
    { key: 'phoneme_18', label: 'Semi-fermé', description: 'half-closed lips, soft murmur / trailing word end' },
    { key: 'phoneme_19', label: 'Choc doux', description: 'mouth opens wider but eyes/brows/head stay fixed like other cells (only oral opening changes)' },
    { key: 'phoneme_20', label: 'I étroit', description: 'narrow vertical slit mouth, slight stretch for “IH” vowel' },
    { key: 'phoneme_21', label: 'Voyelle centrale', description: 'neutral mid-open mouth, relaxed schwa-like position' },
    { key: 'phoneme_22', label: 'Conversation', description: 'everyday talking mouth, slightly open, natural in-motion lips' },
    { key: 'phoneme_23', label: 'Presque fermé', description: 'nearly closed, quick transition between syllables' },
    { key: 'phoneme_24', label: 'Ouvert large', description: 'large vertical open (emphasis), still same head position' },
    { key: 'phoneme_25', label: 'Fin de phrase', description: 'soft closed smile, friendly end-of-sentence mouth' },
];

/**
 * Variantes de bouche supplémentaires utilisées pour étoffer la grille au-delà de 25 cases (ex. 8×8 = 64 cases).
 * Chaque entrée ne fait varier que la zone bouche/mâchoire — tout le reste (tête, lumière, fond, vêtements) doit rester identique.
 */
const EXTRA_MOUTH_VARIANTS = [
    { label: 'Bouche fermée détendue', description: 'lips fully closed, neutral relaxed seal, no smile' },
    { label: 'À peine entrouvert', description: 'lips just parted with a hairline gap, ready to speak' },
    { label: 'OO étroit avancé', description: 'lips pursed forward into a tight rounded \"oo\", small opening' },
    { label: 'Voyelle médiane', description: 'mouth mid-open with a neutral schwa-like vowel position' },
    { label: 'AH large', description: 'jaw clearly dropped, wide vertical \"AH\" vowel opening' },
    { label: 'EE souriant', description: 'horizontal \"EE\" smile, lips spread, lower teeth lightly visible' },
    { label: 'F/V doux', description: 'lower lip gently touching upper teeth for an F/V viseme' },
    { label: 'S/Z subtil', description: 'teeth lightly parted with a soft \"S/Z\" lip shape, lips relaxed' },
    { label: 'O arrondi mi-large', description: 'medium rounded \"O\", jaw mid-low, smooth lips' },
    { label: 'Asymétrie légère', description: 'slight asymmetric grin, one corner a touch higher than the other, mid-open' },
    { label: 'Murmure mi-fermé', description: 'half-closed soft mouth, end-of-syllable transition murmur' },
    { label: 'Sourire fermé chaleureux', description: 'closed-mouth warm smile, cheeks slightly raised' },
    { label: 'Plosive prête (P/B)', description: 'lips pressed together about to release a P/B plosive' },
    { label: 'Voyelle ouverte ronde', description: 'open round vowel between \"O\" and \"OH\", relaxed jaw' },
    { label: 'Petit sourire ouvert', description: 'slight open smile showing tip of teeth, friendly speaking pose' },
    { label: 'Bouche en transition', description: 'mid-transition mouth, asymmetric small opening between syllables' },
];

/**
 * Construit `count` poses supplémentaires identifiées `phoneme_<startIndex+i>` à partir des variantes ci-dessus.
 * Permet d’atteindre dynamiquement la taille de grille (ex. 64 pour une feuille 8×8).
 */
function buildAutoMouthPoses(startIndex, count) {
    const out = [];
    for (let i = 0; i < count; i += 1) {
        const variant = EXTRA_MOUTH_VARIANTS[i % EXTRA_MOUTH_VARIANTS.length];
        const idx = startIndex + i;
        const tag = String(idx).padStart(2, '0');
        out.push({
            key: `phoneme_${tag}`,
            label: `${variant.label} (${idx})`,
            description: `${variant.description}; same head pose, camera angle, lighting, identity, outfit, accessories, background and crop as every other cell — ONLY the mouth changes`,
        });
    }
    return out;
}

/**
 * Liste finale des poses utilisée pour la prompt monolithique et le découpage.
 * - Si la grille demande ≤ 25 cases : on garde le sous-ensemble historique.
 * - Sinon : on complète avec des variantes auto-générées (clés `phoneme_26`, `phoneme_27`, …).
 */
const MASCOT_POSES = (function buildMascotPosesForGrid() {
    const total = MASCOT_GRID_FRAMES;
    if (total <= BASE_MASCOT_POSES.length) {
        return BASE_MASCOT_POSES.slice(0, total);
    }
    return [
        ...BASE_MASCOT_POSES,
        ...buildAutoMouthPoses(BASE_MASCOT_POSES.length + 1, total - BASE_MASCOT_POSES.length),
    ];
})();

/**
 * NB: l'emoji choisi à l'étape 1 de la création n'est PAS injecté dans la prompt image.
 * Il restait visible dans les anciennes versions ("emoji cue / inspiration: 🤖") et l'IA finissait par
 * rendre des éléments parasites. On le retire entièrement, l'identité visuelle dépend uniquement
 * du nom de l'expert (ex. "coach sportif", "infirmier"...).
 */
function buildRoleStyleHint(avatarName /* icon: ignoré volontairement */) {
    const safeName = String(avatarName || 'Expert').trim();
    const lower = safeName.toLowerCase();
    if (/(pharma|médical|medecin|médecin|docteur|doctor|santé|sante|infirmier|nurse|health)/i.test(lower)) {
        return `Mascot for "${safeName}": warm, trustworthy wellness / pharmacy-adjacent expert — professional and approachable; avoid misleading clinical claims in the image; no pills or prescription imagery unless the role is explicitly medical and appropriate.`;
    }
    if (/(coach|sport|fitness|gym|muscu|trainer|entraîn)/i.test(lower)) {
        return `Mascot for "${safeName}": energetic fitness / gym coach — sporty, friendly, athletic look (cap, performance top, headset optional).`;
    }
    if (/(ingénieur|ingenieur|engineer|électricien|electricien|élec\b|tech|technicien|developer|développeur|devops|IT\b)/i.test(lower)) {
        return `Mascot for "${safeName}": technical / engineering expert — smart, approachable; subtle workwear or safety cues if appropriate; headset optional for voice-assistant context.`;
    }
    if (/(prof|teacher|formateur|éducation|education|académ)/i.test(lower)) {
        return `Mascot for "${safeName}": friendly educator / trainer — clear, encouraging presence; outfit fits teaching or coaching.`;
    }
    if (/(chef|cuisine|restaurant|gastro)/i.test(lower)) {
        return `Mascot for "${safeName}": culinary / hospitality character — polished, appetizing energy without brand logos; outfit fits the kitchen or service role.`;
    }
    if (/(business|commercial|vente|sales|corporate|consult)/i.test(lower)) {
        return `Mascot for "${safeName}": professional business / advisor character — confident, approachable, contemporary corporate-casual styling.`;
    }
    return `Mascot for "${safeName}": ONE cohesive 3D character — expressive, friendly, polished; wardrobe and accessories clearly match the job title (interpret the name literally for outfit props). Do NOT include emojis, icons, badges, app-icon stickers or pictogram overlays in the rendered image.`;
}

function appendExtraPrompt(base) {
    if (!MASCOT_EXTRA_PROMPT) return base;
    return `${base}\n\nAdditional direction from operator:\n${MASCOT_EXTRA_PROMPT}`;
}

function buildMasterPrompt({ avatarName /* icon: ignored on purpose */ }) {
    const roleHint = buildRoleStyleHint(avatarName);
    const safeName = String(avatarName || 'Expert').trim();
    const otherFrames = Math.max(1, MASCOT_GRID_FRAMES - 1);
    return appendExtraPrompt(`
Create ONE ultra-high-detail 3D CGI bust portrait for a lip-sync / talking-head sprite pipeline (Pixar–grade or premium mobile game mascot: smooth shading, appealing proportions, crisp silhouette).

Sprite intent: this frame will be sequenced with ${otherFrames} mouth-only variants for a seamless speech loop on the web — phoneme-style transitions (neutral closed → slight open → wide vowels → smile, etc.).

Character & role (single consistent identity — ${safeName}):
${roleHint}

This request produces ONLY ONE square panel (not a ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} collage). The server will assemble ${MASCOT_GRID_FRAMES} panels into a single sheet; this image is frame 1 (reference identity).

Art direction (match a professional talking-head sprite):
- Framing: head-and-shoulders bust, centered, front-facing camera; same crop will be reused for ${otherFrames} other mouth-only variants.
- Character: expressive, friendly, sporty / fitness-coach vibe unless the role hint above suggests otherwise.
- Lighting: soft studio key + fill, consistent direction.
- Background (mandatory): smooth dark charcoal / blue-gray studio backdrop only — e.g. solid tones around #2e3440–#3b4252 or a subtle radial vignette. NEVER pure white (#ffffff) or blown-out white edges.
- Rendering quality: sharp focus, crisp edges, high micro-detail on skin and fabric; avoid JPEG mush, noise blobs, or “melting” facial features; headset and microphone boom must read as clean 3D geometry (metal/plastic), not a blurry smudge.
- Identity lock for later frames: same hard hat / cap brim line, hair, skin tone, eyes, PPE (vest, etc.), headset ear cups, microphone boom — only the mouth will change in other renders.
- Microphone boom: treat as rigid geometry — same angle, length, and tip position relative to the nose/chin across all future frames (no swing, no rescaling).
- Spatial lock: frozen 3D rig — identical camera distance, zero head yaw/pitch/roll, zero crop drift; only mouth blendshapes move between frames.

Frame 1 (neutral viseme): mouth relaxed, lips gently closed or barely parted; natural welcoming expression; eyes toward camera.
- No text, no watermark, no grid lines, no multi-panel layout in this image.
- No emojis, no icon stickers, no pictogram badges, no app-icon roundels — pure 3D rendered character only.
- Avoid recognizable third-party logos on clothing.

Technical: single PNG-ready composition, one character, one camera, no collage.
`.trim());
}

function buildCandidatePrompt({ avatarName, variantIndex }) {
    const roleHint = buildRoleStyleHint(avatarName);
    const safeName = String(avatarName || 'Expert').trim();
    return appendExtraPrompt(`
Create ONE high-quality neutral 3D talking-head mascot portrait candidate for "${safeName}".

Purpose:
- This is one of ${MASCOT_CANDIDATE_COUNT} different face/person candidates shown to a user before generating a lip-sync sprite.
- The user will choose exactly one candidate; that chosen image will become the permanent reference frame for a ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} lip-sync sheet.

Character direction:
${roleHint}

Candidate variation ${variantIndex}:
- Make this a distinct person/design from the other candidates: different face shape, hairstyle/cap choice, subtle outfit/accent choices.
- Keep the same professional role and the same overall art quality.

Hard composition rules:
- Single character only, centered head-and-shoulders bust, front-facing camera, neutral friendly face.
- Mouth relaxed and mostly closed; this is NOT a talking frame and NOT a grid.
- Same clean dark charcoal / blue-gray studio background (#2e3440–#3b4252), no white background.
- Full face visible: do not crop forehead, chin, ears, headset, shoulders, or cap.
- No text, no watermark, no logo, no emoji, no icon sticker, no pictogram badge, no app icon.
- Crisp premium 3D CGI render, sharp eyes, clean mouth, no blur, no deformed features.

Technical: square PNG-ready portrait, one character, one camera, no collage, no grid.
`.trim());
}

function buildIdentityLockPrompt(referenceImageUrl, poseLabel, strictAttempt, strictTotal) {
    return `
IDENTITY LOCK (lip-sync sheet — playback must not jitter):
- Pixel-consistent with the reference: same head angle (0 yaw/pitch/roll), eye gaze, iris position, eyebrows, nose, cheeks, hairstyle, hard hat/cap, headset ear cups, clothing, shoulders, lighting direction, background color, scale and crop.
- LOCKED CAMERA: same camera distance, same focal length, same perspective, same composition, same face position, same head size, same crop, same zoom level. Static camera, no camera movement.
- Framing: passport photo / medium close shot matching the reference exactly; centered face with identical forehead, chin, ears, neck and shoulder margins.
- ONLY change the mouth, lips, jaw, and minimal adjacent cheek skin for viseme: ${poseLabel}
- FORBIDDEN: zoom in/out, reframing, head slide, tilt, different shadow placement, white or blown-out background, redrawn helmet or mic boom, different vest or shirt folds.
- Do NOT change body pose or outfit between frames.
- Consistency pass: ${strictAttempt}/${strictTotal}
- Reference image URL: ${referenceImageUrl || 'N/A'}
`.trim();
}

function buildPosePromptV2({ avatarName /* icon: ignored on purpose */ }, mouthDescription, visemeLabel, referenceImageUrl, options = {}) {
    const roleHint = buildRoleStyleHint(avatarName);
    const referenceNote = options.chainFromPrevious
        ? `
SEQUENTIAL EDIT (critical): The attached reference image is the PREVIOUS frame (N−1), not inspiration art.
- Same render pass: preserve helmet/hard hat, headset, microphone boom geometry and position, vest/shirt, skin, eyes, hair, lighting, dark studio background, camera crop — unchanged outside the oral cavity.
- ONLY mouth / jaw / lips (+ tiny cheek band): micro-delta, not a redraw.
- LOCKED CAMERA: same camera distance, same focal length, same perspective, same head size, same face position, same crop and same zoom level. Static camera, no close-up, no camera movement.
- Do NOT move, shorten, or rotate the mic boom; do NOT shift the hard hat or change brim height; no zoom or reframing.
- If unsure, duplicate the reference and alter only pixels inside the mouth mask.
`
        : `
MASTER REFERENCE LOCK (critical): The attached reference image is the fixed master frame, not loose inspiration art.
- Keep EVERYTHING identical to the master reference: camera, zoom, framing, lighting, head position, crop, perspective, background, hair, outfit, headset and composition.
- ONLY slightly change the mouth shape for the requested talking viseme; use tiny lip movement and subtle speaking expression only.
- Do not create a new expression, emotion, pose, close-up, camera angle, or character redraw.
`;
    return appendExtraPrompt(`
Viseme "${visemeLabel}" — same person as the reference image (single continuous sprite pipeline).

${referenceNote}
${roleHint}

Mouth target (only this may differ from reference):
- ${mouthDescription}

Hard rules:
- ONE square bust shot; same 3D person, same garments and accessories as the reference.
- Same dark neutral studio background (#2e3440–#3b4252 range), NEVER pure white — same lighting as reference.
- Passport photo / medium close shot framing exactly like the reference: identical head size, identical face center, identical forehead/chin/shoulder margins.
- NO zoom, NO crop drift, NO head translation, NO close-up: eyes, nose, ears, hat brim, headset, mic tip align to the reference image.
- No grid, no ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} collage in-frame, no second character, no text, no watermark.
- No emojis, no icon stickers, no pictogram badges anywhere in the image.
- Eyes and brows frozen vs reference; only mouth/jaw moves as specified.

Reference image URL: ${referenceImageUrl || 'N/A'}
`.trim());
}

/**
 * Un seul appel API : une image PNG contenant la grille COLS×ROWS (= MASCOT_GRID_FRAMES visèmes), même personnage dans toutes les cases.
 * Défaut configuré : 7×7 (49 visèmes). Surcharger via MASCOT_GRID_COLS / MASCOT_GRID_ROWS pour passer à 4×4 ou 8×8 si besoin.
 */
function buildMonolithGridPrompt({ avatarName /* icon: ignored on purpose */ }) {
    const roleHint = buildRoleStyleHint(avatarName);
    const safeName = String(avatarName || 'Expert').trim();
    const cols = MASCOT_GRID_COLS;
    const rows = MASCOT_GRID_ROWS;
    const totalCells = MASCOT_GRID_FRAMES;
    const rowLines = [];
    for (let r = 0; r < rows; r += 1) {
        const cells = [];
        for (let c = 0; c < cols; c += 1) {
            const idx = r * cols + c;
            const p = MASCOT_POSES[idx];
            if (!p) continue;
            cells.push(`frame ${idx + 1}: ${p.description}`);
        }
        rowLines.push(`Row ${r + 1} (left→right): ${cells.join(' · ')}`);
    }
    return appendExtraPrompt(`
Generate exactly ONE ultra-high-fidelity square PNG: a perfect ${cols}×${rows} lip-sync sprite GRID (${totalCells} equal square cells, ${cols} columns × ${rows} rows). One flat bitmap — not ${totalCells} separate files.

WAIST-UP LIP-SYNC SPRITE SHEET (same portrait repeated):
- IMPORTANT: EVERY single cell MUST be a waist-up shot showing the full chest, torso, and shoulders.
- DO NOT ZOOM IN ON THE FACE. DO NOT CROP THE SHOULDERS. 
- If the shoulders are cut off, the image is ruined. Keep the camera far back.
- Same 3D mascot in the SAME bust pose, camera angle, scale, crop, lighting, and background in every cell.
- ONLY the mouth, lips, and jaw change between cells (closed, slightly open, wide open, smile, etc.).
- Quality: vibrant, professional, polished 3D character (Pixar / high-end game mascot level); sharp focus, smooth surfaces, no mushy artifacts.

Character — ONE coherent design for "${safeName}" (interpret the role literally for outfit and props; absolutely NO emojis, icons, badges, stickers or pictograms drawn anywhere in the image):
${roleHint}

IDENTITY LOCK ACROSS THE GRID (most important):
- This is NOT a team, NOT multiple candidates, NOT different workers. It is the EXACT SAME single person repeated in all ${totalCells} cells.
- Treat cell 1 (top-left) as the master portrait. Cells 2-${totalCells} must be copy-paste duplicates of cell 1 with ONLY the mouth pixels changed for the requested viseme.
- Same exact gender, age, ethnicity, face, eye color, eye shape, nose, cheeks, jawline, ears, hairstyle, facial hair, skin tone, helmet/cap/headset, microphone boom, shirt, vest, collar, shoulders, background, lighting, camera and crop in every cell.
- Do NOT swap between male/female, cap/helmet, different uniforms, different hair, different headset, different vest colors, different collar shape, different face shape, different smile lines, different age, or different skin tone. If any non-mouth feature changes, the output is wrong.
- Only the mouth expression/viseme changes between cells; everything else must look like duplicated layers of the same portrait, aligned as if generated from one frozen 3D rig.
- Do not invent alternate designs for the role. Do not create variations, options, candidates, coworkers, uniforms, safety gear, hats or hairstyles. There is exactly one character design.

SPATIAL REGISTRATION (critical — lip-sync will flash/jitter if ignored):
- Imagine ${totalCells} transparent layers stacked: the outline of the face, hat, headphones, eyes, nose, ears, neck, and shoulders must PIXEL-ALIGN across ALL cells. NO drift left/right/up/down of the head between cells.
- Same fixed camera: identical focal length, identical crop box, identical bust scale. The character silhouette occupies the same bounding rectangle in every cell.
- Eyes: same iris position, same eyelid shape; eyebrows frozen — do NOT raise/lower brows between cells.
- Head pose: 0° yaw, 0° pitch, 0° roll — identical in every cell.
- ONLY the mouth opening (lips, teeth visibility, jaw inner motion) and a tiny band of adjacent cheek skin may change — nothing above the upper lip hairline / nostrils may move.

Identity & style (apply the character brief above in every cell):
- ONE continuous 3D CGI character (Pixar / high-end game mascot quality) visible across all ${totalCells} cells.
- Identical person in every cell: same face shape, skin, eyes, eye spacing, eyebrows, hair, hat/cap, headphones, outfit, body position, shoulders, lighting, camera distance, bust framing in ALL cells.
- The outfit and accessories are locked after cell 1: same hat/helmet type, same headset size and earcups, same mic boom length and tip position, same shirt color, same vest color and reflective stripes.
- Background in EVERY cell: same dark charcoal / blue-gray studio (#2e3440–#3b4252 range) — absolutely NO white or near-white backdrop.
- Visual fidelity: sharp, clean render; crisp mouth shapes; readable microphone boom; avoid blur, banding, or inconsistent eyes between cells.
- ONLY the mouth, lips, jaw, and minimal adjacent cheek motion may change from cell to cell — following the viseme text for that cell exactly.
- Cells are read in row-major order: top-left = frame 1, bottom-right = frame ${totalCells}.

Layout:
- Exactly ${totalCells} RECTANGULAR cells of strictly equal pixel width and height (square cells, same width and height in pixels for every cell); total image width = ${cols}×cell width and height = ${rows}×cell height with no fractional strip — one flat bitmap — NOT a collage of stickers, polaroids, app icons, or UI tiles.
- Keep the bust scaled to ~82–88% of each cell height with even margin on all sides inside the cell (never touch the cell edges) so automated slicing never captures part of the neighbor cell.
- Cells must touch edge-to-edge: ZERO white gutters, ZERO rounded-rectangle “cards” around each face, ZERO per-cell drop shadows or borders, ZERO light gray hairlines between cells. The background and character must read as one continuous image across row/column boundaries.
- Do NOT give each cell its own white or off-white rounded “plate”, sticker back, or polaroid frame behind the bust — the studio fill must be one shared dark field (#2e3440–#3b4252) with no per-cell lighter rectangles or corner radii.
- No black lines, no dark gutters, no hairline separators — only continuous artwork and the same studio background across the whole sheet.
- Front-facing WAIST-UP shot (showing chest and shoulders) in each cell; same scale and crop everywhere. DO NOT crop to the face only. Keep the camera far back.

Per-cell viseme targets (must match cell position):
${rowLines.join('\n')}

Hard negatives:
- Do NOT output ${totalCells} separate images or a strip without a grid — ONE composite image only.
- Do NOT change clothing, accessories, or character identity between cells.
- Do NOT create multiple people, multiple genders, different hats, different helmets, different uniforms, different hair, different faces, or different ages.
- Do NOT shift, resize, or reframe the head or bust between cells — only the mouth region animates.
- Absolutely NO readable text anywhere in the image: no labels, no captions, no pose names, no frame numbers, no row/column numbers, no subtitles, no annotations, no letters, no words, no watermarks, no brand logos on clothing.
- The viseme target list above is only generation guidance; it must NEVER be drawn or printed inside the PNG.
- No emojis, no icon stickers, no pictogram badges, no app-icon roundels anywhere in any cell — pure photorealistic / Pixar-style 3D render only.
- No drawn grid, ruler lines, cell borders, “comic panel” outlines, frosted-glass panels, or per-cell frames anywhere on the image.
- Do NOT put each face inside its own white rounded square, pill shape, or badge — that breaks automated slicing and causes visible neighbors at playback.
`.trim());
}

/**
 * Partage [0, total) en `parts` bandes entières dont la somme = total.
 * `Math.floor(total/parts)` seul laisse un reste (ex. 1024 → 5×204) et décale
 * chaque ligne/colonne : on voit le bas de la case voisine en haut de la case.
 */
function axisSliceBounds(total, parts) {
    const n = Math.max(1, Math.floor(parts));
    const t = Math.max(0, Math.floor(total));
    const bounds = [0];
    for (let i = 1; i < n; i += 1) {
        bounds.push(Math.round((i * t) / n));
    }
    bounds.push(t);
    return bounds;
}

/**
 * Découpe la feuille unique en pose-01 … pose-NN (compatibilité manifest / aperçus).
 * NN = MASCOT_GRID_FRAMES (= MASCOT_GRID_COLS × MASCOT_GRID_ROWS, défaut 49 = 7×7).
 */
async function sliceMonolithSheetToPoseFiles(sheetAbsolutePath, outputDir, numericAvatarId) {
    let sharpMod;
    try {
        sharpMod = require('sharp');
    } catch (err) {
        const win = process.platform === 'win32';
        const hint = win
            ? ' Sous Windows, installez aussi le binaire : npm install @img/sharp-win32-x64 --legacy-peer-deps'
            : '';
        throw new Error(
            `Impossible de charger sharp pour découper la feuille ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} (${String(err?.message || err)}). ` +
                `Exécutez : npm install sharp --legacy-peer-deps${hint}`
        );
    }
    const meta = await sharpMod(sheetAbsolutePath).metadata();
    const w = Number(meta.width) || 0;
    const h = Number(meta.height) || 0;
    if (!w || !h) throw new Error('Impossible de lire les dimensions de la feuille sprite.');
    const cols = MASCOT_GRID_COLS;
    const rows = MASCOT_GRID_ROWS;
    const totalCells = MASCOT_GRID_FRAMES;
    const boundsX = axisSliceBounds(w, cols);
    const boundsY = axisSliceBounds(h, rows);
    const minCellW = Math.min(
        ...Array.from({ length: cols }, (_, c) => boundsX[c + 1] - boundsX[c])
    );
    const minCellH = Math.min(
        ...Array.from({ length: rows }, (_, r) => boundsY[r + 1] - boundsY[r])
    );
    if (minCellW < 32 || minCellH < 32) throw new Error(`Feuille trop petite pour une grille ${cols}×${rows}.`);
    const trim = MASCOT_SPRITE_SLICE_GRID_TRIM;

    const images = [];
    for (let i = 0; i < totalCells; i += 1) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cellW = boundsX[col + 1] - boundsX[col];
        const cellH = boundsY[row + 1] - boundsY[row];
        let innerW = Math.max(32, cellW - 2 * trim);
        let innerH = Math.max(32, cellH - 2 * trim);
        let left = Math.min(boundsX[col] + trim, w - innerW);
        let top = Math.min(boundsY[row] + trim, h - innerH);
        if (MASCOT_MONOLITH_CELL_SHRINK < 1) {
            const ew = Math.max(32, Math.floor(innerW * MASCOT_MONOLITH_CELL_SHRINK));
            const eh = Math.max(32, Math.floor(innerH * MASCOT_MONOLITH_CELL_SHRINK));
            left += Math.floor((innerW - ew) / 2);
            top += Math.floor((innerH - eh) / 2);
            innerW = ew;
            innerH = eh;
        }
        const pose = MASCOT_POSES[i];
        const fileName = `pose-${String(i + 1).padStart(2, '0')}.png`;
        const outPath = path.join(outputDir, fileName);
        await sharpMod(sheetAbsolutePath)
            .extract({ left, top, width: innerW, height: innerH })
            .png({ compressionLevel: 7, adaptiveFiltering: true })
            .toFile(outPath);
        await normalizeMascotPosePngToCellSize(outPath);
        images.push({
            index: i + 1,
            key: pose.key,
            label: pose.label,
            url: `${PUBLIC_AVATAR_ROOT}/avatar-${numericAvatarId}/${fileName}`,
        });
    }
    return images;
}

function isInsufficientBalanceError(err) {
    const msg = String(err?.message || '').toLowerCase();
    return /insufficient balance|top up your credits|insufficient credits|balance/i.test(msg);
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

function decodeDataUrlToBuffer(dataUrl) {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return null;
    const meta = dataUrl.slice(5, commaIdx);
    const payload = dataUrl.slice(commaIdx + 1);
    return /;base64$/i.test(meta) ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload));
}

function extractReplicateImageUrl(output) {
    if (!output) return null;
    if (typeof output === 'string') return output;
    if (Array.isArray(output)) {
        for (const item of output) {
            const found = extractReplicateImageUrl(item);
            if (found) return found;
        }
        return null;
    }
    if (typeof output === 'object') {
        return output.url || output.image || output.image_url || output.file || null;
    }
    return null;
}

function extractOpenRouterImageUrl(response) {
    const message = response?.choices?.[0]?.message;
    if (!message) return null;

    const images = Array.isArray(message.images) ? message.images : [];
    for (const image of images) {
        const url = image?.image_url?.url || image?.url;
        if (url) return url;
    }

    const content = message.content;
    if (typeof content === 'string') {
        const match = content.match(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/i);
        return match?.[0] || null;
    }
    if (Array.isArray(content)) {
        for (const part of content) {
            const url = part?.image_url?.url || part?.url;
            if (url) return url;
            if (typeof part?.text === 'string') {
                const match = part.text.match(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/i);
                if (match) return match[0];
            }
        }
    }
    return null;
}

async function downloadImageUrlToFile(imageUrl, outputAbsolutePath) {
    let buffer;
    if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
        buffer = decodeDataUrlToBuffer(imageUrl);
    } else {
        const dl = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
        });
        buffer = Buffer.from(dl.data);
    }

    if (!buffer || !buffer.length) {
        const err = new Error('Image vide après décodage.');
        err.status = 502;
        throw err;
    }

    await fs.writeFile(outputAbsolutePath, buffer);
}

async function generateImageViaOpenRouterMultimodal({
    prompt,
    referenceImagePath,
    outputAbsolutePath,
    model = DEFAULT_OPENROUTER_MASCOT_MODEL,
    aspectRatio = '1:1',
}) {
    const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey) {
        const err = new Error('OPENROUTER_API_KEY manquant.');
        err.status = 400;
        throw err;
    }

    const content = [{ type: 'text', text: prompt }];
    if (referenceImagePath) {
        const buf = await fs.readFile(referenceImagePath);
        const ext = path.extname(referenceImagePath).toLowerCase();
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        content.push({
            type: 'image_url',
            image_url: { url: `data:${mime};base64,${buf.toString('base64')}` },
        });
    }

    const res = await fetchWithTimeout(
        `${OPENROUTER_API_BASE_URL}/chat/completions`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:3000',
                'X-Title': process.env.OPENROUTER_APP_TITLE || 'Pharma Vocal Mascot Generator',
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content }],
                modalities: ['image', 'text'],
                image_config: { aspect_ratio: aspectRatio },
            }),
        },
        OPENAI_REQUEST_TIMEOUT_MS
    );

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        const snippet = text ? text.slice(0, 600).replace(/\s+/g, ' ') : '';
        const err = new Error(`OpenRouter ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ''}`);
        err.status = res.status === 401 || res.status === 403 ? 401 : 502;
        throw err;
    }

    const json = await res.json();
    const imageUrl = extractOpenRouterImageUrl(json);
    if (!imageUrl) {
        const err = new Error(`OpenRouter n’a pas retourné d’image (modèle=${model}).`);
        err.status = 502;
        throw err;
    }

    await downloadImageUrlToFile(imageUrl, outputAbsolutePath);
    return { model, aspectRatio };
}

/**
 * Génère une image via Replicate `openai/gpt-image-2` en mode multimodal
 * (image+texte → image), puis sauvegarde le PNG résultant.
 */
async function generateImageViaReplicateMultimodal({
    prompt,
    referenceImagePath,
    outputAbsolutePath,
    model = MASCOT_REPLICATE_MODEL,
    aspectRatio = '1:1',
}) {
    const apiKey = String(process.env.REPLICATE_API_TOKEN || '').trim();
    if (!apiKey) {
        const err = new Error('REPLICATE_API_TOKEN manquant.');
        err.status = 400;
        throw err;
    }

    const input = {
        prompt,
        aspect_ratio: aspectRatio,
        quality: MASCOT_REPLICATE_QUALITY,
        number_of_images: 1,
        output_format: 'png',
        background: 'opaque',
        moderation: 'auto',
    };

    if (referenceImagePath) {
        const buf = await fs.readFile(referenceImagePath);
        const ext = path.extname(referenceImagePath).toLowerCase();
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        input.input_images = [`data:${mime};base64,${buf.toString('base64')}`];
    }

    const createUrl = `${REPLICATE_API_BASE_URL}/models/${model}/predictions`;
    const createRes = await fetchWithTimeout(
        createUrl,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                Prefer: 'wait=60',
            },
            body: JSON.stringify({ input }),
        },
        OPENAI_REQUEST_TIMEOUT_MS
    );

    if (!createRes.ok) {
        const text = await createRes.text().catch(() => '');
        const snippet = text ? text.slice(0, 400).replace(/\s+/g, ' ') : '';
        const err = new Error(`Replicate ${createRes.status} ${createRes.statusText}${snippet ? ` — ${snippet}` : ''}`);
        err.status = createRes.status === 401 || createRes.status === 403 ? 401 : 502;
        throw err;
    }

    let prediction = await createRes.json();
    const startedAt = Date.now();
    while (prediction && !['succeeded', 'failed', 'canceled'].includes(prediction.status)) {
        if (Date.now() - startedAt > MASCOT_REPLICATE_TIMEOUT_MS) {
            const err = new Error(`Replicate timeout après ${Math.round(MASCOT_REPLICATE_TIMEOUT_MS / 1000)}s.`);
            err.status = 504;
            throw err;
        }

        await new Promise((resolve) => setTimeout(resolve, MASCOT_REPLICATE_POLL_INTERVAL_MS));
        const pollUrl = prediction.urls?.get || `${REPLICATE_API_BASE_URL}/predictions/${prediction.id}`;
        const pollRes = await fetchWithTimeout(
            pollUrl,
            { headers: { Authorization: `Bearer ${apiKey}` } },
            OPENAI_REQUEST_TIMEOUT_MS
        );
        if (!pollRes.ok) {
            const text = await pollRes.text().catch(() => '');
            const snippet = text ? text.slice(0, 400).replace(/\s+/g, ' ') : '';
            const err = new Error(`Replicate poll ${pollRes.status} ${pollRes.statusText}${snippet ? ` — ${snippet}` : ''}`);
            err.status = 502;
            throw err;
        }
        prediction = await pollRes.json();
    }

    if (prediction.status !== 'succeeded') {
        const detail = prediction.error ? `: ${prediction.error}` : '';
        const err = new Error(`Replicate prediction ${prediction.status || 'unknown'}${detail}`);
        err.status = 502;
        throw err;
    }

    const imageUrl = extractReplicateImageUrl(prediction.output);
    if (!imageUrl) {
        const err = new Error(`Replicate n’a pas retourné d’image (modèle=${model}).`);
        err.status = 502;
        throw err;
    }

    await downloadImageUrlToFile(imageUrl, outputAbsolutePath);
    return { model, aspectRatio, quality: MASCOT_REPLICATE_QUALITY };
}

async function saveGeneratedImage(imageData, absolutePath) {
    if (imageData?.b64_json) {
        const buffer = Buffer.from(imageData.b64_json, 'base64');
        await fs.writeFile(absolutePath, buffer);
        return;
    }

    if (imageData?.url) {
        const response = await axios.get(imageData.url, {
            responseType: 'arraybuffer',
            timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
        });
        await fs.writeFile(absolutePath, Buffer.from(response.data));
        return;
    }

    const err = new Error('Réponse image invalide (ni b64_json ni url).');
    err.status = 502;
    throw err;
}

function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Assemble toutes les poses PNG en une seule feuille sprite (grille MASCOT_GRID_COLS×MASCOT_GRID_ROWS, défaut 7×7 = 49 cases).
 * Affichage côté client : background-size = taille feuille, background-position par cellule.
 */
async function composeSpriteSheetForManifest(manifest, outputDir) {
    let sharp;
    try {
        sharp = require('sharp');
    } catch (_) {
        console.warn('[MascotService] sharp non disponible, pas de feuille sprite.');
        return null;
    }

    const sorted = [...(manifest.images || [])].sort((a, b) => Number(a.index) - Number(b.index));
    if (!sorted.length) return null;

    const paths = sorted.map((img) => {
        const base = String(img.url || '').split('/').pop();
        return path.join(outputDir, base);
    });

    for (const p of paths) {
        try {
            await fs.access(p);
        } catch (_) {
            console.warn('[MascotService] Fichier pose manquant pour sprite:', p);
            return null;
        }
    }

    /* Grille MASCOT_GRID_COLS × ceil(N/cols) : on respecte la grille demandée (défaut 7×7 = 49 cases). */
    const cols = MASCOT_GRID_COLS;
    const rows = Math.max(MASCOT_GRID_ROWS, Math.ceil(sorted.length / cols));

    const tileBuffers = [];
    for (let i = 0; i < paths.length; i += 1) {
        const buf = await fs.readFile(paths[i]);
        const resized = await sharp(buf)
            .resize(MASCOT_SPRITE_CELL_MAX, MASCOT_SPRITE_CELL_MAX, {
                fit: 'contain',
                position: 'center',
                background: { r: 8, g: 15, b: 30, alpha: 1 },
            })
            .sharpen({ sigma: 0.95, m1: 1.2, m2: 0.6, x1: 2, y2: 10, y3: 20 })
            .png({ compressionLevel: 7, adaptiveFiltering: true })
            .toBuffer();
        tileBuffers.push(resized);
    }

    const cellW = MASCOT_SPRITE_CELL_MAX;
    const cellH = MASCOT_SPRITE_CELL_MAX;

    const composites = tileBuffers.map((input, i) => ({
        input,
        left: (i % cols) * cellW,
        top: Math.floor(i / cols) * cellH,
    }));

    const outAbs = path.join(outputDir, MASCOT_SPRITE_SHEET_NAME);
    await sharp({
        create: {
            width: cols * cellW,
            height: rows * cellH,
            channels: 4,
            background: { r: 8, g: 15, b: 30, alpha: 1 },
        },
    })
        .composite(composites)
        .png({ compressionLevel: 7, adaptiveFiltering: true })
        .toFile(outAbs);

    const numericAvatarId = Number(manifest.avatarId);
    return {
        url: `${PUBLIC_AVATAR_ROOT}/avatar-${numericAvatarId}/${MASCOT_SPRITE_SHEET_NAME}`,
        cols,
        rows,
        frameCount: sorted.length,
    };
}

async function persistMascotManifest(manifest, outputDir) {
    try {
        if (!manifest.spriteSheet?.url) {
            const spriteMeta = await composeSpriteSheetForManifest(manifest, outputDir);
            if (spriteMeta) {
                manifest.spriteSheet = spriteMeta;
            }
        }
    } catch (err) {
        console.warn('[MascotService] Feuille sprite ignorée:', err.message);
    }
    const manifestPath = path.join(outputDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

class MascotService {
    constructor() {
        const resolvedOpenAIImageModel = resolveOpenAIImageModel(DEFAULT_IMAGE_MODEL);
        const requestedProvider = String(process.env.MASCOT_PROVIDER || '').trim().toLowerCase();
        const openrouterKey = String(process.env.OPENROUTER_API_KEY || '').trim();
        const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();

        let useOpenRouter = false;
        if (requestedProvider === 'pixverse') {
            this.provider = 'pixverse';
        } else if (requestedProvider === 'openrouter') {
            /* Nano Banana 2 sur OpenRouter passe par /chat/completions + modalities image/text,
               pas par l'endpoint OpenAI /images/generations. */
            if (openrouterKey) {
                useOpenRouter = true;
                this.provider = 'openrouter';
            } else {
                this.provider = 'openai';
                console.warn('[MascotService] MASCOT_PROVIDER=openrouter mais OPENROUTER_API_KEY est manquant — utilisation OpenAI.');
            }
        } else if (requestedProvider === 'openai') {
            this.provider = 'openai';
        } else {
            /* Par défaut : OpenAI dès qu'une clé OpenAI est présente (génération d'images fiable).
               OpenRouter seulement si on n'a que cette clé-là (et au risque d'un 404 sur images.generate). */
            if (openaiKey) {
                this.provider = 'openai';
            } else if (openrouterKey) {
                this.provider = 'openrouter';
                useOpenRouter = true;
            } else {
                this.provider = 'openai';
            }
        }

        if (this.provider === 'openrouter') {
            useOpenRouter = true;
        }

        this.model = useOpenRouter ? DEFAULT_OPENROUTER_MASCOT_MODEL : resolvedOpenAIImageModel;

        this.openai = new OpenAI({
            apiKey: useOpenRouter ? openrouterKey : process.env.OPENAI_API_KEY,
            baseURL: useOpenRouter ? OPENROUTER_API_BASE_URL : OPENAI_API_BASE_URL,
            defaultHeaders: useOpenRouter ? {
                'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:3000',
                'X-Title': process.env.OPENROUTER_APP_TITLE || 'Pharma Vocal Mascot Generator'
            } : undefined,
            timeout: OPENAI_REQUEST_TIMEOUT_MS,
            maxRetries: 1,
        });

        console.info(`[MascotService] Mascotte images — provider=${this.provider}, model=${this.model}`);
    }

    isConfigured() {
        if (this.provider === 'pixverse') {
            return Boolean(String(process.env.PIXVERSE_API_KEY || '').trim())
                && Boolean(String(process.env.OPENAI_API_KEY || '').trim());
        }
        return Boolean(String(process.env.REPLICATE_API_TOKEN || '').trim())
            || Boolean(String(process.env.OPENROUTER_API_KEY || '').trim())
            || Boolean(String(process.env.OPENAI_API_KEY || '').trim());
    }

    getPixverseHeaders() {
        return {
            'API-KEY': process.env.PIXVERSE_API_KEY,
            'Ai-trace-id': randomUUID(),
        };
    }

    async uploadImageToPixverse(absoluteImagePath) {
        const form = new FormData();
        form.append('image', fsSync.createReadStream(absoluteImagePath));
        const response = await axios.post(
            `${PIXVERSE_API_BASE_URL}/openapi/v2/image/upload`,
            form,
            {
                headers: {
                    ...this.getPixverseHeaders(),
                    ...form.getHeaders(),
                },
                timeout: OPENAI_REQUEST_TIMEOUT_MS,
            }
        );
        const data = response?.data;
        if (data?.ErrCode !== 0 || !data?.Resp?.img_id) {
            throw new Error(data?.ErrMsg || 'Upload image PixVerse échoué.');
        }
        return data.Resp.img_id;
    }

    async generatePixverseVideoFromImage({ imgId, prompt }) {
        const response = await axios.post(
            `${PIXVERSE_API_BASE_URL}/openapi/v2/video/img/generate`,
            {
                duration: DEFAULT_PIXVERSE_VIDEO_DURATION,
                img_id: imgId,
                model: DEFAULT_PIXVERSE_VIDEO_MODEL,
                motion_mode: 'normal',
                quality: '540p',
                water_mark: false,
                prompt,
            },
            {
                headers: {
                    ...this.getPixverseHeaders(),
                    'Content-Type': 'application/json',
                },
                timeout: OPENAI_REQUEST_TIMEOUT_MS,
            }
        );
        const data = response?.data;
        if (data?.ErrCode !== 0 || !data?.Resp?.video_id) {
            throw new Error(data?.ErrMsg || 'Génération vidéo PixVerse échouée.');
        }
        return data.Resp.video_id;
    }

    async pollPixverseVideoResult(videoId) {
        const maxPolls = 90; // ~7.5 minutes at 5s interval
        for (let i = 0; i < maxPolls; i += 1) {
            const response = await axios.get(
                `${PIXVERSE_API_BASE_URL}/openapi/v2/video/result/${videoId}`,
                {
                    headers: this.getPixverseHeaders(),
                    timeout: OPENAI_REQUEST_TIMEOUT_MS,
                }
            );
            const data = response?.data;
            const status = Number(data?.Resp?.status || 0);
            if (data?.ErrCode !== 0) {
                throw new Error(data?.ErrMsg || 'Erreur statut vidéo PixVerse.');
            }
            if (status === 1 && data?.Resp?.url) {
                return data.Resp.url;
            }
            if (status === 7 || status === 8) {
                throw new Error(data?.ErrMsg || 'PixVerse a échoué à générer la vidéo.');
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        throw new Error('Timeout PixVerse: vidéo non finalisée.');
    }

    async generateMasterImageWithRetry({ avatarName, icon }) {
        const masterPrompt = buildMasterPrompt({ avatarName, icon });
        const modelCandidates = resolveMascotImageModelCandidates(this.model, this.provider);
        let lastErr = null;

        for (const model of modelCandidates) {
            for (let attempt = 1; attempt <= MASCOT_RETRY_ATTEMPTS; attempt += 1) {
                try {
                    const response = await this.openai.images.generate(
                        applyGptImageGenerateParams(
                            {
                                model,
                                prompt: masterPrompt,
                                size: resolvePoseGenerationSize(this.provider, model),
                                output_format: 'png',
                            },
                            model,
                            this.provider
                        )
                    );
                    const image = response?.data?.[0];
                    if (!image) throw new Error('Image master manquante dans la réponse.');
                    return image;
                } catch (err) {
                    lastErr = err;
                    const msg = String(err?.message || '');
                    const retryable = /terminated|timeout|temporarily|rate limit|overloaded|internal/i.test(msg);
                    const isLastAttempt = attempt === MASCOT_RETRY_ATTEMPTS;
                    if (!retryable || isLastAttempt) break;
                    await new Promise(resolve => setTimeout(resolve, MASCOT_RETRY_DELAY_MS * attempt));
                }
            }
        }

        const finalErr = new Error(`Échec génération image master OpenAI: ${lastErr?.message || 'erreur inconnue'}`);
        finalErr.status = 502;
        throw finalErr;
    }

    async generateMascotCandidates({ avatarId, avatarName, icon, onProgress }) {
        if (!this.isConfigured()) {
            const err = new Error('REPLICATE_API_TOKEN / OPENAI_API_KEY manquante. Impossible de générer les propositions mascotte.');
            err.status = 400;
            throw err;
        }

        const numericAvatarId = Number(avatarId);
        if (!Number.isFinite(numericAvatarId) || numericAvatarId <= 0) {
            const err = new Error('avatarId invalide.');
            err.status = 400;
            throw err;
        }

        const outputDir = getMascotOutputDir(numericAvatarId);
        const candidateDir = getMascotCandidateDir(numericAvatarId);
        await fs.mkdir(candidateDir, { recursive: true });

        const modelCandidates = resolveMascotImageModelCandidates(this.model, this.provider);
        const candidates = [];

        for (let i = 1; i <= MASCOT_CANDIDATE_COUNT; i += 1) {
            if (onProgress) {
                await onProgress({
                    generating: true,
                    index: i,
                    total: MASCOT_CANDIDATE_COUNT,
                    label: `Portrait candidat ${i}/${MASCOT_CANDIDATE_COUNT}`,
                });
            }

            const prompt = `${buildCandidatePrompt({ avatarName, icon, variantIndex: i })}

Candidate uniqueness nonce: ${randomUUID().slice(0, 10)}.`;
            const fileName = candidateFileName(i);
            const absolutePath = path.join(candidateDir, fileName);
            let lastErr = null;
            let saved = false;

            if (this.provider === 'openrouter') {
                try {
                    await generateImageViaOpenRouterMultimodal({
                        prompt,
                        outputAbsolutePath: absolutePath,
                        model: this.model,
                        aspectRatio: '1:1',
                    });
                    await normalizeMascotPosePngToCellSize(absolutePath);
                    saved = true;
                    console.info(`[MascotService] Portrait candidat ${i} OK via OpenRouter — model=${this.model}`);
                } catch (err) {
                    lastErr = err;
                    console.warn(`[MascotService] Portrait candidat ${i}: OpenRouter échec:`, err.message);
                }
            }

            const replicateKeyAvailable = Boolean(String(process.env.REPLICATE_API_TOKEN || '').trim());
            if (!saved && MASCOT_REPLICATE_PRIMARY && replicateKeyAvailable) {
                try {
                    await generateImageViaReplicateMultimodal({
                        prompt,
                        outputAbsolutePath: absolutePath,
                        model: MASCOT_REPLICATE_MODEL,
                        aspectRatio: '1:1',
                    });
                    await normalizeMascotPosePngToCellSize(absolutePath);
                    saved = true;
                    console.info(
                        `[MascotService] Portrait candidat ${i} OK via Replicate — model=${MASCOT_REPLICATE_MODEL} quality=${MASCOT_REPLICATE_QUALITY}`
                    );
                } catch (err) {
                    lastErr = err;
                    console.warn(
                        `[MascotService] Portrait candidat ${i}: Replicate échec, repli provider=${this.provider} model=${this.model}:`,
                        err.message
                    );
                }
            }

            if (this.provider !== 'openrouter') {
                for (const model of modelCandidates) {
                    if (saved) break;
                    for (let attempt = 1; attempt <= MASCOT_RETRY_ATTEMPTS; attempt += 1) {
                        try {
                            const response = await this.openai.images.generate(
                                applyGptImageGenerateParams(
                                    {
                                        model,
                                        prompt,
                                        size: resolvePoseGenerationSize(this.provider, model),
                                        output_format: 'png',
                                    },
                                    model,
                                    this.provider
                                )
                            );
                            const image = response?.data?.[0];
                            if (!image) throw new Error('Image candidat manquante dans la réponse.');
                            await saveGeneratedImage(image, absolutePath);
                            await normalizeMascotPosePngToCellSize(absolutePath);
                            saved = true;
                            break;
                        } catch (err) {
                            lastErr = err;
                            const retryable = /terminated|timeout|temporarily|rate limit|overloaded|internal/i.test(String(err?.message || ''));
                            if (!retryable || attempt === MASCOT_RETRY_ATTEMPTS) break;
                            await new Promise(resolve => setTimeout(resolve, MASCOT_RETRY_DELAY_MS * attempt));
                        }
                    }
                    if (saved) break;
                }
            }

            if (!saved) {
                const err = new Error(`Échec génération portrait candidat ${i}: ${lastErr?.message || 'erreur inconnue'}`);
                err.status = 502;
                throw err;
            }

            const candidate = {
                index: i,
                label: `Proposition ${i}`,
                url: candidatePublicUrl(numericAvatarId, i),
            };
            candidates.push(candidate);
            if (onProgress) {
                await onProgress({
                    index: i,
                    total: MASCOT_CANDIDATE_COUNT,
                    label: candidate.label,
                    candidate,
                    candidates,
                });
            }
        }

        const manifestPath = path.join(outputDir, 'candidates.json');
        await fs.writeFile(
            manifestPath,
            JSON.stringify(
                {
                    avatarId: numericAvatarId,
                    avatarName: String(avatarName || '').trim() || `Avatar ${numericAvatarId}`,
                    provider: this.provider,
                    model: this.model,
                    generatedAt: new Date().toISOString(),
                    candidates,
                },
                null,
                2
            ),
            'utf8'
        );

        return { avatarId: numericAvatarId, candidates };
    }

    resolveCandidateAbsolutePath({ avatarId, selectedCandidateIndex }) {
        const numericAvatarId = Number(avatarId);
        const index = Number(selectedCandidateIndex);
        if (!Number.isFinite(numericAvatarId) || numericAvatarId <= 0) return null;
        if (!Number.isInteger(index) || index < 1 || index > MASCOT_CANDIDATE_COUNT) return null;
        return path.join(getMascotCandidateDir(numericAvatarId), candidateFileName(index));
    }

    async copyMascotSet({ fromAvatarId, toAvatarId, avatarName, icon }) {
        const sourceAvatarId = Number(fromAvatarId);
        const targetAvatarId = Number(toAvatarId);
        if (!Number.isFinite(sourceAvatarId) || sourceAvatarId <= 0) {
            const err = new Error('previewId mascotte invalide.');
            err.status = 400;
            throw err;
        }
        if (!Number.isFinite(targetAvatarId) || targetAvatarId <= 0) {
            const err = new Error('avatarId cible invalide.');
            err.status = 400;
            throw err;
        }

        const sourceDir = getMascotOutputDir(sourceAvatarId);
        const targetDir = getMascotOutputDir(targetAvatarId);
        const sourceManifestPath = path.join(sourceDir, 'manifest.json');
        try {
            await fs.access(sourceManifestPath);
        } catch (_) {
            const err = new Error('Aperçu mascotte introuvable. Relancez la génération de la feuille mascotte avant de créer l’agent.');
            err.status = 404;
            throw err;
        }

        await fs.rm(targetDir, { recursive: true, force: true });
        await fs.mkdir(path.dirname(targetDir), { recursive: true });
        await fs.cp(sourceDir, targetDir, { recursive: true });

        const rawManifest = await fs.readFile(sourceManifestPath, 'utf8');
        const manifest = JSON.parse(rawManifest);
        const sourceRoot = `${PUBLIC_AVATAR_ROOT}/avatar-${sourceAvatarId}`;
        const targetRoot = `${PUBLIC_AVATAR_ROOT}/avatar-${targetAvatarId}`;
        const rewriteUrl = (url) => (typeof url === 'string' ? url.replace(sourceRoot, targetRoot) : url);

        manifest.avatarId = targetAvatarId;
        manifest.avatarName = String(avatarName || manifest.avatarName || `Avatar ${targetAvatarId}`).trim();
        manifest.icon = String(icon || manifest.icon || '').trim();
        manifest.copiedFromPreviewId = sourceAvatarId;
        manifest.copiedAt = new Date().toISOString();
        if (Array.isArray(manifest.images)) {
            manifest.images = manifest.images.map((img) => ({ ...img, url: rewriteUrl(img?.url) }));
        }
        if (Array.isArray(manifest.videos)) {
            manifest.videos = manifest.videos.map((video) => ({ ...video, url: rewriteUrl(video?.url) }));
        }
        if (manifest.spriteSheet?.url) {
            manifest.spriteSheet = { ...manifest.spriteSheet, url: rewriteUrl(manifest.spriteSheet.url) };
        }
        await persistMascotManifest(manifest, targetDir);
        return manifest;
    }

    /**
     * Une seule image API avec grille COLS×ROWS intégrée, puis découpe locale en MASCOT_GRID_FRAMES fichiers.
     * Défaut : 7×7 = 49 visèmes ; configurable via MASCOT_GRID_COLS / MASCOT_GRID_ROWS.
     */
    async generateMonolithSpriteSheet({ manifest, outputDir, numericAvatarId, avatarName, icon, referenceImagePath, selectedCandidateIndex, onProgress }) {
        if (onProgress) {
            await onProgress({
                generating: true,
                index: 0,
                total: MASCOT_POSES.length,
                label: referenceImagePath
                    ? `Feuille ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} image + prompt (une seule génération, ${MASCOT_GRID_FRAMES} cases)`
                    : `Feuille ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} (une seule génération, ${MASCOT_GRID_FRAMES} cases)`,
            });
        }

        const buildPrompt = (withReference) => (withReference
            ? `${buildMonolithGridPrompt({ avatarName, icon })}

REFERENCE PORTRAIT LOCK:
- The attached image is the MASTER SOURCE IMAGE, not inspiration. Build the entire ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} sheet from this exact person.
- Frame 1 (top-left cell) must be the attached portrait recreated as closely as possible.
- Frames 2-${MASCOT_GRID_FRAMES} must be duplicates of frame 1 with ONLY mouth/lips/jaw adjusted for the per-cell viseme.
- Keep the EXACT same identity, gender, age, ethnicity, face, eye color, eyebrows, nose, cheeks, jawline, ears, hair, facial hair, skin tone, outfit, vest/shirt colors, helmet/cap/headset, microphone, lighting, crop, background and shoulder visibility in ALL cells.
- Keep the EXACT same camera distance, framing, head size, face position and shoulder visibility as the reference image in ALL cells. DO NOT ZOOM IN.
- Do not invent a new person, new face, new hairstyle, new helmet/cap, new headset, new clothing, new vest color, new camera angle, new background, or alternate role design.
- If the model is uncertain, copy the attached portrait into all ${MASCOT_GRID_FRAMES} cells first, then only edit the mouth region per cell.`
            : buildMonolithGridPrompt({ avatarName, icon }));

        const sheetAbs = path.join(outputDir, MASCOT_SPRITE_SHEET_NAME);
        const sizes = getMonolithSizeCandidates();
        const modelsToTry = resolveMascotImageModelCandidates(this.model, this.provider);

        let lastErr = null;
        let saved = false;
        const requiresReference = Boolean(referenceImagePath);
        const useReference = requiresReference;

        if (this.provider === 'openrouter') {
            try {
                const prompt = buildPrompt(Boolean(referenceImagePath));
                await generateImageViaOpenRouterMultimodal({
                    prompt,
                    referenceImagePath,
                    outputAbsolutePath: sheetAbs,
                    model: this.model,
                    aspectRatio: '1:1',
                });
                if (onProgress) {
                    await onProgress({
                        generating: true,
                        index: 0,
                        total: MASCOT_POSES.length,
                        label: `Image ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} reçue d’OpenRouter Nano Banana 2, préparation locale...`,
                    });
                }
                saved = true;
                console.info(`[MascotService] Feuille monolithique OK via OpenRouter — model=${this.model} (image+texte)`);
            } catch (err) {
                lastErr = err;
                const openrouterErr = new Error(
                    `OpenRouter Nano Banana 2 a échoué pour la feuille ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS}: ${err?.message || 'erreur inconnue'}`
                );
                openrouterErr.status = err?.status || 502;
                throw openrouterErr;
            }
        }

        const replicateKeyAvailable = Boolean(String(process.env.REPLICATE_API_TOKEN || '').trim());
        if (!saved && requiresReference && !replicateKeyAvailable) {
            const err = new Error('REPLICATE_API_TOKEN manquant. La feuille monolithique image + prompt doit utiliser Replicate.');
            err.status = 400;
            throw err;
        }
        if (!saved && referenceImagePath && replicateKeyAvailable) {
            for (let attempt = 1; attempt <= MASCOT_RETRY_ATTEMPTS && !saved; attempt += 1) {
                try {
                    const prompt = buildPrompt(true);
                    await generateImageViaReplicateMultimodal({
                        prompt,
                        referenceImagePath,
                        outputAbsolutePath: sheetAbs,
                        model: MASCOT_REPLICATE_MODEL,
                        aspectRatio: '1:1',
                    });
                    if (onProgress) {
                        await onProgress({
                            generating: true,
                            index: 0,
                            total: MASCOT_POSES.length,
                            label: `Image ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} reçue de Replicate, préparation locale...`,
                        });
                    }
                    if (MASCOT_SPRITE_SHEET_UPSCALE > 1) {
                        try {
                            if (onProgress) {
                                await onProgress({
                                    generating: true,
                                    index: 0,
                                    total: MASCOT_POSES.length,
                                    label: `Upscale local ×${MASCOT_SPRITE_SHEET_UPSCALE} de la feuille ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS}...`,
                                });
                            }
                            const buf = await fs.readFile(sheetAbs);
                            const up = await maybeUpscaleSpriteSheetBuffer(buf);
                            if (up && up.length) await fs.writeFile(sheetAbs, up);
                        } catch (e) {
                            console.warn('[MascotService] Upscale feuille (Replicate) ignoré:', e.message);
                        }
                    }
                    saved = true;
                    console.info(
                        `[MascotService] Feuille monolithique OK via Replicate — model=${MASCOT_REPLICATE_MODEL} quality=${MASCOT_REPLICATE_QUALITY} (image+texte)`
                    );
                } catch (err) {
                    lastErr = err;
                    console.warn(
                        `[MascotService] Replicate multimodal échec (${attempt}/${MASCOT_RETRY_ATTEMPTS}):`,
                        err.message
                    );
                    if (attempt < MASCOT_RETRY_ATTEMPTS) {
                        await new Promise((resolve) => setTimeout(resolve, MASCOT_RETRY_DELAY_MS * attempt));
                    }
                }
            }
            if (!saved && requiresReference) {
                const err = new Error(
                    `Replicate multimodal requis pour générer la feuille ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} image + prompt, ` +
                        `mais la génération Replicate a échoué: ${lastErr?.message || 'erreur inconnue'}`
                );
                err.status = lastErr?.status || 502;
                throw err;
            }
            if (!saved) {
                console.warn('[MascotService] Replicate multimodal indisponible — tentative OpenAI texte seul.');
            }
        }

        const isUnsupportedEditError = (err) => {
            const msg = String(err?.message || '').toLowerCase();
            return (
                msg.includes("must be 'dall-e-2'") ||
                msg.includes('must be "dall-e-2"') ||
                msg.includes('verified organization') ||
                msg.includes('organization verification') ||
                msg.includes('organization must be verified')
            );
        };

        for (const genModel of modelsToTry) {
            if (saved) break;
            for (const size of sizes) {
                if (saved) break;
                for (let attempt = 1; attempt <= MASCOT_RETRY_ATTEMPTS; attempt += 1) {
                    if (saved) break;
                    try {
                        const prompt = buildPrompt(useReference);
                        const response = useReference
                            ? await this.openai.images.edit({
                                  model: genModel,
                                  prompt,
                                  image: fsSync.createReadStream(referenceImagePath),
                                  size,
                              })
                            : await this.openai.images.generate(
                                  applyGptImageGenerateParams(
                                      {
                                          model: genModel,
                                          prompt,
                                          size,
                                          output_format: 'png',
                                      },
                                      genModel,
                                      this.provider
                                  )
                              );
                        const image = response?.data?.[0];
                        if (!image) throw new Error('Réponse image vide.');
                        await saveGeneratedImage(image, sheetAbs);
                        if (onProgress) {
                            await onProgress({
                                generating: true,
                                index: 0,
                                total: MASCOT_POSES.length,
                                label: `Image ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} reçue, préparation locale...`,
                            });
                        }
                        if (MASCOT_SPRITE_SHEET_UPSCALE > 1) {
                            try {
                                if (onProgress) {
                                    await onProgress({
                                        generating: true,
                                        index: 0,
                                        total: MASCOT_POSES.length,
                                        label: `Upscale local ×${MASCOT_SPRITE_SHEET_UPSCALE} de la feuille ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS}...`,
                                    });
                                }
                                const buf = await fs.readFile(sheetAbs);
                                const up = await maybeUpscaleSpriteSheetBuffer(buf);
                                if (up && up.length) await fs.writeFile(sheetAbs, up);
                            } catch (e) {
                                console.warn('[MascotService] Upscale feuille ignoré:', e.message);
                            }
                        }
                        saved = true;
                        console.info(`[MascotService] Feuille monolithique OK — model=${genModel} size=${size}${useReference ? ' (edit+référence)' : ' (texte seul)'}`);
                        break;
                    } catch (err) {
                        lastErr = err;
                        console.warn(`[MascotService] Monolith échec model=${genModel} size=${size} (${attempt}/${MASCOT_RETRY_ATTEMPTS}):`, err.message);
                        if (useReference && isUnsupportedEditError(err)) {
                            const refErr = new Error(
                                'La génération monolithique image + prompt a été refusée par OpenAI. ' +
                                    'Le portrait choisi ne sera pas remplacé par une génération texte seul. ' +
                                    'Utilisez Replicate multimodal ou un endpoint OpenAI images.edit autorisé.'
                            );
                            refErr.status = 502;
                            throw refErr;
                        }
                        if (attempt < MASCOT_RETRY_ATTEMPTS) {
                            await new Promise((resolve) => setTimeout(resolve, MASCOT_RETRY_DELAY_MS * attempt));
                        }
                    }
                }
                if (saved) break;
            }
            if (saved) break;
        }

        if (!saved) {
            const err = new Error(`Échec génération de la feuille unique ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS}: ${lastErr?.message || 'erreur inconnue'}`);
            err.status = 502;
            throw err;
        }

        if (onProgress) {
            await onProgress({
                generating: true,
                index: 0,
                total: MASCOT_POSES.length,
                label: `Découpe locale des ${MASCOT_GRID_FRAMES} cases (${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS})...`,
            });
        }
        manifest.images = await sliceMonolithSheetToPoseFiles(sheetAbs, outputDir, numericAvatarId);
        manifest.spriteSheet = {
            url: `${PUBLIC_AVATAR_ROOT}/avatar-${numericAvatarId}/${MASCOT_SPRITE_SHEET_NAME}`,
            cols: MASCOT_GRID_COLS,
            rows: MASCOT_GRID_ROWS,
            frameCount: MASCOT_GRID_FRAMES,
        };
        manifest.monolithSingleShot = true;
        if (referenceImagePath) {
            manifest.referenceLockedMonolith = true;
            manifest.selectedCandidateIndex = Number(selectedCandidateIndex) || null;
            if (manifest.images[0]) {
                manifest.images[0] = {
                    ...manifest.images[0],
                    selectedCandidateIndex: Number(selectedCandidateIndex) || null,
                };
            }
        }

        if (onProgress) {
            await onProgress({
                index: MASCOT_POSES.length,
                total: MASCOT_POSES.length,
                label: `Découpe des ${MASCOT_GRID_FRAMES} cases (${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS})`,
                images: manifest.images,
            });
        }
    }

    async generateMascotSet({ avatarId, avatarName, icon, selectedCandidateIndex, selectedMasterAbsolutePath, onProgress }) {
        if (!this.isConfigured()) {
            const err = new Error('REPLICATE_API_TOKEN / OPENAI_API_KEY manquante. Impossible de générer la mascotte.');
            err.status = 400;
            throw err;
        }

        const numericAvatarId = Number(avatarId);
        if (!Number.isFinite(numericAvatarId) || numericAvatarId <= 0) {
            const err = new Error('avatarId invalide.');
            err.status = 400;
            throw err;
        }

        const outputDir = getMascotOutputDir(numericAvatarId);

        await fs.mkdir(outputDir, { recursive: true });
        let chosenMasterAbsolutePath = selectedMasterAbsolutePath || null;
        if (!chosenMasterAbsolutePath && selectedCandidateIndex !== undefined && selectedCandidateIndex !== null && selectedCandidateIndex !== '') {
            chosenMasterAbsolutePath = this.resolveCandidateAbsolutePath({ avatarId: numericAvatarId, selectedCandidateIndex });
        }
        if (chosenMasterAbsolutePath) {
            const resolvedCandidate = path.resolve(chosenMasterAbsolutePath);
            const allowedRoot = path.resolve(getMascotGeneratedRoot());
            if (!resolvedCandidate.startsWith(`${allowedRoot}${path.sep}`)) {
                const err = new Error('Portrait candidat invalide.');
                err.status = 400;
                throw err;
            }
            try {
                await fs.access(resolvedCandidate);
            } catch (_) {
                const err = new Error('Portrait candidat introuvable. Regénérez les 3 propositions puis choisissez-en une.');
                err.status = 404;
                throw err;
            }
            chosenMasterAbsolutePath = resolvedCandidate;
        }

        const manifest = {
            avatarId: numericAvatarId,
            avatarName: String(avatarName || '').trim() || `Avatar ${numericAvatarId}`,
            model: this.model,
            provider: this.provider,
            generatedAt: new Date().toISOString(),
            images: [],
            videos: [],
        };

        const poseImageSize = resolvePoseGenerationSize(this.provider, this.model);

        if (this.provider === 'pixverse') {
            // 1) Build a single canonical master image
            if (onProgress) {
                await onProgress({
                    generating: true,
                    index: 1,
                    total: MASCOT_POSES.length,
                    label: 'Image de référence (master)',
                });
            }

            const masterFileName = 'pose-01.png';
            const masterAbsolutePath = path.join(outputDir, masterFileName);
            if (chosenMasterAbsolutePath) {
                await fs.copyFile(chosenMasterAbsolutePath, masterAbsolutePath);
            } else {
                const masterImage = await this.generateMasterImageWithRetry({ avatarName, icon });
                await saveGeneratedImage(masterImage, masterAbsolutePath);
            }
            await normalizeMascotPosePngToCellSize(masterAbsolutePath);
            const masterUrl = `${PUBLIC_AVATAR_ROOT}/avatar-${numericAvatarId}/${masterFileName}`;
            manifest.images.push({
                index: 1,
                key: 'idle_front',
                label: MASCOT_POSES[0].label,
                url: masterUrl,
            });
            if (onProgress) {
                await onProgress({ generating: true, index: 1, total: MASCOT_POSES.length, label: MASCOT_POSES[0].label, image: manifest.images[0] });
            }

            // 2) Chaîne visèmes : même identité buste, bouche uniquement (feuille COLS×ROWS, défaut 7×7).
            manifest.warning = `Mode images : ${MASCOT_GRID_FRAMES} visèmes buste en chaîne (référence + variations bouche pour lip-sync).`;
            const chainMode = String(process.env.MASCOT_CHAIN_REFERENCE_MODE || 'master').trim().toLowerCase();
            let chainReferencePath = masterAbsolutePath;
            let chainReferenceUrl = masterUrl;
            for (let i = 0; i < MASCOT_POSES.length; i += 1) {
                const pose = MASCOT_POSES[i];
                if (onProgress) {
                    await onProgress({ generating: true, index: i + 1, total: MASCOT_POSES.length, label: pose.label });
                }

                if (i === 0) {
                    continue; // pose-01 already generated as the identity reference
                }

                const prompt = buildPosePromptV2(
                    { avatarName, icon },
                    pose.description,
                    pose.label,
                    chainReferenceUrl,
                    { chainFromPrevious: chainMode === 'previous' }
                );
                const identityLockedPrompt = `${prompt}\n\n${buildIdentityLockPrompt(chainReferenceUrl, pose.label, 1, 1)}

CHAINE VISÈMES (obligatoire):
- Image de référence = base directe (même personnage 3D, même cadrage buste, même fond).
- Modifier UNIQUEMENT la bouche / mâchoire / lèvres pour : ${pose.description}
- Ne pas changer la posture du corps ni la rotation de la tête.`;
                const poseFileName = `pose-${String(i + 1).padStart(2, '0')}.png`;
                const poseAbsolutePath = path.join(outputDir, poseFileName);
                const poseUrl = `${PUBLIC_AVATAR_ROOT}/avatar-${numericAvatarId}/${poseFileName}`;

                let generated = false;
                let lastImageErr = null;
                for (let attempt = 1; attempt <= MASCOT_RETRY_ATTEMPTS; attempt += 1) {
                    try {
                        let imgRes = null;
                        if (OPENAI_MASCOT_EDIT_MODEL) {
                            try {
                                imgRes = await this.openai.images.edit({
                                    model: OPENAI_MASCOT_EDIT_MODEL,
                                    prompt: identityLockedPrompt,
                                    image: fsSync.createReadStream(chainReferencePath),
                                    size: '1024x1024',
                                });
                            } catch (_) {
                                imgRes = null;
                            }
                        }

                        if (!imgRes) {
                            try {
                                imgRes = await this.openai.images.generate(
                                    applyGptImageGenerateParams(
                                        {
                                            model: this.model,
                                            prompt: identityLockedPrompt,
                                            image: fsSync.createReadStream(chainReferencePath),
                                            size: poseImageSize,
                                            output_format: 'png',
                                        },
                                        this.model,
                                        this.provider
                                    )
                                );
                            } catch (genErr) {
                                const msg = String(genErr?.message || '');
                                const badImageParam = /unknown parameter[^\n]{0,120}image|does not support[^\n]{0,120}image/i.test(msg);
                                if (!badImageParam) throw genErr;
                                imgRes = await this.openai.images.generate(
                                    applyGptImageGenerateParams(
                                        {
                                            model: this.model,
                                            prompt: identityLockedPrompt,
                                            size: poseImageSize,
                                            output_format: 'png',
                                        },
                                        this.model,
                                        this.provider
                                    )
                                );
                            }
                        }

                        const imgData = imgRes?.data?.[0];
                        if (!imgData) throw new Error('Image de pose manquante');
                        await saveGeneratedImage(imgData, poseAbsolutePath);
                        await normalizeMascotPosePngToCellSize(poseAbsolutePath);

                        // Ensure pose is not byte-identical to master.
                        const [masterBuf, poseBuf] = await Promise.all([
                            fs.readFile(masterAbsolutePath),
                            fs.readFile(poseAbsolutePath),
                        ]);
                        const sameAsMaster = sha256(masterBuf) === sha256(poseBuf);
                        if (sameAsMaster) {
                            throw new Error('Pose identique au master');
                        }

                        generated = true;
                        break;
                    } catch (err) {
                        lastImageErr = err;
                        if (attempt === MASCOT_RETRY_ATTEMPTS) break;
                        await new Promise(resolve => setTimeout(resolve, MASCOT_RETRY_DELAY_MS * attempt));
                    }
                }

                if (!generated) {
                    const err = new Error(`Échec image pose ${i + 1} (${pose.label}): ${lastImageErr?.message || 'erreur inconnue'}`);
                    err.status = 502;
                    throw err;
                }

                manifest.images.push({
                    index: i + 1,
                    key: pose.key,
                    label: pose.label,
                    url: poseUrl,
                });
                /*
                 * Stratégie de référence pour la chaîne :
                 * - 'master' (défaut) : chaque visème est généré à partir de pose-01 (le master). Pas de
                 *   dérive cumulée sur 64 frames, identité visuelle plus stable.
                 * - 'previous' : chaque visème dérive du précédent — micro-variations plus douces mais
                 *   risque que la 64ᵉ frame ait dérivé sensiblement par rapport à la 1ʳᵉ.
                 * Surchargeable via MASCOT_CHAIN_REFERENCE_MODE=previous.
                 */
                if (chainMode === 'previous') {
                    chainReferencePath = poseAbsolutePath;
                    chainReferenceUrl = poseUrl;
                }
                if (onProgress) {
                    await onProgress({
                        index: i + 1,
                        total: MASCOT_POSES.length,
                        image: manifest.images.find(img => img.index === i + 1),
                    });
                }
            }

            await persistMascotManifest(manifest, outputDir);
            return manifest;
        }

        const monolithEnvPreference = shouldUseMonolithSheet(this.provider);
        const useMonolithSheet =
            (monolithEnvPreference || (this.provider === 'openrouter' && MASCOT_OPENROUTER_FORCE_MONOLITH)) &&
            (this.provider === 'openai' || this.provider === 'openrouter');
        if (useMonolithSheet) {
            if (!monolithEnvPreference && this.provider === 'openrouter' && MASCOT_OPENROUTER_FORCE_MONOLITH) {
                console.warn(
                    `[MascotService] Provider OpenRouter : génération via feuille unique ${MASCOT_GRID_COLS}×${MASCOT_GRID_ROWS} (MASCOT_OPENROUTER_FORCE_MONOLITH=1). ` +
                        `Les ${MASCOT_GRID_FRAMES} appels « une pose + image de référence » peuvent être moins fiables côté API, ` +
                        'mais la feuille unique peut changer l’identité entre cellules.'
                );
            }
            await this.generateMonolithSpriteSheet({
                manifest,
                outputDir,
                numericAvatarId,
                avatarName,
                icon,
                referenceImagePath: chosenMasterAbsolutePath,
                selectedCandidateIndex,
                onProgress,
            });
            await persistMascotManifest(manifest, outputDir);
            return manifest;
        }

        let referenceImagePath = null;
        let referenceImageUrl = null;
        let useEditEndpoint = this.provider === 'openai' && Boolean(String(OPENAI_MASCOT_EDIT_MODEL || '').trim());

        for (let i = 0; i < MASCOT_POSES.length; i += 1) {
            const pose = MASCOT_POSES[i];
            const chainFromPath = referenceImagePath;

            if (onProgress) {
                try {
                    await onProgress({
                        generating: true,
                        index: i + 1,
                        total: MASCOT_POSES.length,
                        label: pose.label
                    });
                } catch (err) {
                    console.error('Error in onProgress callback (generating):', err);
                }
            }

            const fileName = `pose-${String(i + 1).padStart(2, '0')}.png`;
            const absolutePath = path.join(outputDir, fileName);

            if (i === 0 && chosenMasterAbsolutePath) {
                await fs.copyFile(chosenMasterAbsolutePath, absolutePath);
                await normalizeMascotPosePngToCellSize(absolutePath);
                referenceImagePath = absolutePath;
                referenceImageUrl = `${PUBLIC_AVATAR_ROOT}/avatar-${numericAvatarId}/${fileName}`;
                const newImage = {
                    index: 1,
                    key: pose.key,
                    label: pose.label,
                    url: referenceImageUrl,
                    selectedCandidateIndex: Number(selectedCandidateIndex) || null,
                };
                manifest.images.push(newImage);
                manifest.selectedCandidateIndex = Number(selectedCandidateIndex) || null;
                manifest.selectedCandidateUrl = newImage.url;
                if (onProgress) {
                    try {
                        await onProgress({
                            index: 1,
                            total: MASCOT_POSES.length,
                            label: 'Portrait choisi',
                            image: newImage
                        });
                    } catch (err) {
                        console.error('Error in onProgress callback:', err);
                    }
                }
                continue;
            }

            const chainMode = String(process.env.MASCOT_CHAIN_REFERENCE_MODE || 'master').trim().toLowerCase();
            let duplicateAttempt = 0;
            let lastDupErr = null;
            /* Regénère si le fichier est strictement identique à la frame précédente (API sans img2img fiable). */
            while (duplicateAttempt < MASCOT_DUPLICATE_POSE_RETRIES) {
                const dupNonce = randomUUID().slice(0, 10);
                const dupNote =
                    duplicateAttempt === 0
                        ? `\n\nRender nonce: ${dupNonce} (pipeline bookkeeping; keep character and viseme as specified.)`
                        : `\n\nPOSE_UNIQUENESS_RETRY_${duplicateAttempt}: dernier fichier PNG était IDENTIQUE (octet pour octet) à la pose précédente — INTERDIT.` +
                              ` Sortie différente obligatoire. Exagérer uniquement bouche/mâchoire/lèvres pour le visème « ${pose.label} ».` +
                              ` Garder identité/cadrage. Nonce: ${dupNonce}`;

                const basePrompt =
                    i === 0
                        ? `${buildMasterPrompt({ avatarName, icon })}${dupNote}`
                        : `${buildPosePromptV2(
                              { avatarName, icon },
                              pose.description,
                              pose.label,
                              referenceImageUrl,
                              { chainFromPrevious: chainMode === 'previous' }
                          )}${dupNote}`;

                let response;
                let lastErr;
                const strictPasses =
                    i > 0 && !useEditEndpoint && MASCOT_STRICT_IDENTITY_MODE && referenceImageUrl
                        ? MASCOT_STRICT_RETRIES
                        : 1;
                const replicateKeyAvailable = Boolean(String(process.env.REPLICATE_API_TOKEN || '').trim());
                for (let strictAttempt = 1; strictAttempt <= strictPasses; strictAttempt += 1) {
                    const strictPrompt =
                        i > 0 && !useEditEndpoint && referenceImageUrl
                            ? `${basePrompt}\n\n${buildIdentityLockPrompt(
                                  referenceImageUrl,
                                  pose.label,
                                  strictAttempt,
                                  strictPasses
                              )}`
                            : basePrompt;
                    response = null;
                    lastErr = null;
                    if (i > 0 && referenceImagePath && MASCOT_REPLICATE_PRIMARY && replicateKeyAvailable) {
                        try {
                            await generateImageViaReplicateMultimodal({
                                prompt: strictPrompt,
                                referenceImagePath,
                                outputAbsolutePath: absolutePath,
                                model: MASCOT_REPLICATE_MODEL,
                                aspectRatio: '1:1',
                            });
                            await normalizeMascotPosePngToCellSize(absolutePath);
                            response = { data: [{ savedDirectly: true }] };
                            lastErr = null;
                            break;
                        } catch (replicateErr) {
                            lastErr = replicateErr;
                            console.warn(
                                `[MascotService] Visème ${i + 1}: Replicate frame-by-frame échec, repli provider=${this.provider} model=${this.model}:`,
                                replicateErr.message
                            );
                        }
                    }
                    for (let attempt = 1; attempt <= MASCOT_RETRY_ATTEMPTS; attempt += 1) {
                        try {
                            if (i === 0) {
                                response = await this.openai.images.generate(
                                    applyGptImageGenerateParams(
                                        {
                                            model: this.model,
                                            prompt: strictPrompt,
                                            size: poseImageSize,
                                            output_format: 'png',
                                        },
                                        this.model,
                                        this.provider
                                    )
                                );
                            } else if (!referenceImagePath) {
                                throw new Error('Référence image manquante pour enchaîner les visèmes.');
                            } else if (useEditEndpoint) {
                                response = await this.openai.images.edit({
                                    model: OPENAI_MASCOT_EDIT_MODEL,
                                    prompt: strictPrompt,
                                    image: fsSync.createReadStream(referenceImagePath),
                                    size: '1024x1024',
                                });
                            } else {
                                try {
                                    response = await this.openai.images.generate(
                                        applyGptImageGenerateParams(
                                            {
                                                model: this.model,
                                                prompt: strictPrompt,
                                                image: fsSync.createReadStream(referenceImagePath),
                                                size: poseImageSize,
                                                output_format: 'png',
                                            },
                                            this.model,
                                            this.provider
                                        )
                                    );
                                } catch (withRefErr) {
                                    const msg = String(withRefErr?.message || '');
                                    const badImageParam =
                                        /unknown parameter[^\n]{0,120}image|does not support[^\n]{0,120}image/i.test(
                                            msg
                                        );
                                    if (badImageParam) {
                                        response = await this.openai.images.generate(
                                            applyGptImageGenerateParams(
                                                {
                                                    model: this.model,
                                                    prompt: strictPrompt,
                                                    size: poseImageSize,
                                                    output_format: 'png',
                                                },
                                                this.model,
                                                this.provider
                                            )
                                        );
                                    } else if (OPENAI_MASCOT_EDIT_MODEL) {
                                        try {
                                            response = await this.openai.images.edit({
                                                model: OPENAI_MASCOT_EDIT_MODEL,
                                                prompt: strictPrompt,
                                                image: fsSync.createReadStream(referenceImagePath),
                                                size: '1024x1024',
                                            });
                                        } catch (editErr) {
                                            console.warn(
                                                `[MascotService] Visème ${i + 1}: images.generate+référence puis images.edit ont échoué, repli generate sans référence (logique alignée pipeline Pixverse):`,
                                                editErr.message
                                            );
                                            response = await this.openai.images.generate(
                                                applyGptImageGenerateParams(
                                                    {
                                                        model: this.model,
                                                        prompt: strictPrompt,
                                                        size: poseImageSize,
                                                        output_format: 'png',
                                                    },
                                                    this.model,
                                                    this.provider
                                                )
                                            );
                                        }
                                    } else {
                                        console.warn(
                                            `[MascotService] Visème ${i + 1}: images.generate+référence a échoué, repli generate sans référence (même logique que MASCOT_PROVIDER=pixverse):`,
                                            msg
                                        );
                                        response = await this.openai.images.generate(
                                            applyGptImageGenerateParams(
                                                {
                                                    model: this.model,
                                                    prompt: strictPrompt,
                                                    size: poseImageSize,
                                                    output_format: 'png',
                                                },
                                                this.model,
                                                this.provider
                                            )
                                        );
                                    }
                                }
                            }
                            lastErr = null;
                            break;
                        } catch (err) {
                            lastErr = err;
                            if (useEditEndpoint && /does not exist|invalid value/i.test(String(err?.message || ''))) {
                                console.warn('[MascotService] Edit model unavailable, fallback to generate mode:', err.message);
                                useEditEndpoint = false;
                                break;
                            }
                            const isLastAttempt = attempt === MASCOT_RETRY_ATTEMPTS;
                            console.error(
                                `[MascotService] OpenAI error for pose ${i + 1} (attempt ${attempt}/${MASCOT_RETRY_ATTEMPTS}):`,
                                err.message
                            );
                            if (isLastAttempt) break;
                            await new Promise(resolve => setTimeout(resolve, MASCOT_RETRY_DELAY_MS * attempt));
                        }
                    }
                    if (response || !lastErr) break;
                    if (strictAttempt < strictPasses) {
                        await new Promise(resolve => setTimeout(resolve, 400));
                    }
                }
                if (!response) throw lastErr || new Error(`Generation interrompue pour la pose ${i + 1}.`);

                const image = response?.data?.[0];
                if (!image) {
                    const err = new Error(`Image manquante pour la pose ${i + 1}.`);
                    err.status = 502;
                    throw err;
                }

                if (!image.savedDirectly) {
                    await saveGeneratedImage(image, absolutePath);
                    await normalizeMascotPosePngToCellSize(absolutePath);
                }

                let isDup = false;
                if (i > 0 && chainFromPath) {
                    try {
                        const curBuf = await fs.readFile(absolutePath);
                        const prevBuf = await fs.readFile(chainFromPath);
                        isDup = sha256(curBuf) === sha256(prevBuf);
                    } catch (e) {
                        console.warn('[MascotService] Lecture fichiers pour dédoublonnage ignorée:', e?.message || e);
                    }
                }

                if (!isDup) {
                    lastDupErr = null;
                    break;
                }

                duplicateAttempt += 1;
                lastDupErr = new Error(`Pose ${i + 1} identique à la précédente (hash), tentative ${duplicateAttempt}/${MASCOT_DUPLICATE_POSE_RETRIES}`);
                console.warn(`[MascotService] ${lastDupErr.message}`);
                if (duplicateAttempt >= MASCOT_DUPLICATE_POSE_RETRIES) {
                    const hint =
                        this.provider === 'openrouter'
                            ? ' Astuce : utilisez OPENAI avec clé directe ou Replicate pour de meilleures variations à partir de l’image 1.'
                            : '';
                    throw new Error(
                        `${lastDupErr.message}. L’API renvoie plusieurs fois la même image.` +
                            hint +
                            ' Vous pouvez aussi activer OPENAI_MASCOT_STRICT_IDENTITY_MODE=0 ou augmenter MASCOT_DUPLICATE_POSE_RETRIES.'
                    );
                }
            }

            if (i === 0 || chainMode === 'previous') {
                referenceImagePath = absolutePath;
                referenceImageUrl = `${PUBLIC_AVATAR_ROOT}/avatar-${numericAvatarId}/${fileName}`;
            }

            const newImage = {
                index: i + 1,
                key: pose.key,
                label: pose.label,
                url: `${PUBLIC_AVATAR_ROOT}/avatar-${numericAvatarId}/${fileName}`,
            };

            manifest.images.push(newImage);

            if (onProgress) {
                try {
                    await onProgress({
                        index: i + 1,
                        total: MASCOT_POSES.length,
                        image: newImage
                    });
                } catch (err) {
                    console.error('Error in onProgress callback:', err);
                }
            }
        }

        await persistMascotManifest(manifest, outputDir);

        return manifest;
    }
}

const mascotServiceSingleton = new MascotService();
mascotServiceSingleton.POSE_COUNT = MASCOT_POSES.length;
mascotServiceSingleton.SPRITE_GRID_COLS = MASCOT_GRID_COLS;
mascotServiceSingleton.SPRITE_GRID_ROWS = MASCOT_GRID_ROWS;
mascotServiceSingleton.SPRITE_GRID_FRAMES = MASCOT_GRID_FRAMES;
mascotServiceSingleton.CANDIDATE_COUNT = MASCOT_CANDIDATE_COUNT;
module.exports = mascotServiceSingleton;