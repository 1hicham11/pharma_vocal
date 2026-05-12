const documentProcessor = require('../services/langchain/documentProcessor');
const vectorStoreService = require('../services/langchain/vectorStoreService');
const excelService = require('../services/langchain/excelService');
const mascotService = require('../services/mascotService');
const MASCOT_GEN_COLS = Number(mascotService.SPRITE_GRID_COLS) || 8;
const MASCOT_GEN_ROWS = Number(mascotService.SPRITE_GRID_ROWS) || 8;
const MASCOT_GEN_TOTAL =
    Number(mascotService.SPRITE_GRID_FRAMES) ||
    Number(mascotService.POSE_COUNT) ||
    MASCOT_GEN_COLS * MASCOT_GEN_ROWS;
const ragDocumentRepository = require('../repositories/ragDocumentRepository');
const sessionRepository = require('../repositories/sessionRepository');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const runningMascotJobs = new Set();
const mascotProgressMap = new Map();
const runningMascotPreviewJobs = new Set();
const mascotPreviewProgressMap = new Map();
const runningMascotCandidateJobs = new Set();
const mascotCandidateProgressMap = new Map();
const runningMascotPreviewCandidateJobs = new Set();
const mascotPreviewCandidateProgressMap = new Map();

function mergeMediaByIndex(prevItems, nextItem) {
    const prevList = Array.isArray(prevItems) ? prevItems : [];
    if (!nextItem?.url) return prevList;
    const nextIndex = Number(nextItem.index);
    const withoutSameIndex = prevList.filter(item => Number(item?.index) !== nextIndex);
    return [...withoutSameIndex, nextItem].sort((a, b) => Number(a.index) - Number(b.index));
}

async function generateMascotAndPersist({ avatarId, avatarName, icon, userId, selectedCandidateIndex, previewCandidateAvatarId, onProgress }) {
    const selectedMasterAbsolutePath =
        previewCandidateAvatarId && selectedCandidateIndex
            ? mascotService.resolveCandidateAbsolutePath({
                  avatarId: previewCandidateAvatarId,
                  selectedCandidateIndex,
              })
            : null;
    const manifest = await mascotService.generateMascotSet({
        avatarId,
        avatarName,
        icon,
        selectedCandidateIndex,
        selectedMasterAbsolutePath,
        onProgress
    });

    const firstImage = manifest.images?.[0]?.url || null;
    if (firstImage) {
        try {
            await sessionRepository.updateAvatarImageUrl(avatarId, userId, firstImage);
        } catch (updateErr) {
            console.warn('[AdminController] updateAvatarImageUrl:', updateErr.message);
        }
    }

    return manifest;
}

async function copyPreviewMascotAndPersist({ previewId, avatarId, avatarName, icon, userId }) {
    const manifest = await mascotService.copyMascotSet({
        fromAvatarId: previewId,
        toAvatarId: avatarId,
        avatarName,
        icon,
    });

    const firstImage = manifest.images?.[0]?.url || null;
    if (firstImage) {
        try {
            await sessionRepository.updateAvatarImageUrl(avatarId, userId, firstImage);
        } catch (updateErr) {
            console.warn('[AdminController] updateAvatarImageUrl after preview copy:', updateErr.message);
        }
    }

    return manifest;
}

function launchMascotGenerationJob({ avatarId, avatarName, icon, userId, selectedCandidateIndex, previewCandidateAvatarId }) {
    if (runningMascotJobs.has(avatarId)) return false;

    runningMascotJobs.add(avatarId);
    mascotProgressMap.set(avatarId, { generating: true, index: 0, total: MASCOT_GEN_TOTAL, label: 'Initialisation', images: [], videos: [] });

    (async () => {
        try {
            const manifest = await generateMascotAndPersist({
                avatarId, 
                avatarName, 
                icon, 
                userId, 
                selectedCandidateIndex,
                previewCandidateAvatarId,
                onProgress: (p) => {
                    const prev = mascotProgressMap.get(avatarId) || { images: [], videos: [] };
                    const nextImages = mergeMediaByIndex(prev.images, p?.image);
                    const nextVideos = mergeMediaByIndex(prev.videos, p?.video);

                    mascotProgressMap.set(avatarId, {
                        ...prev,
                        ...p,
                        images: nextImages,
                        videos: nextVideos
                    });
                }
            });
            mascotProgressMap.set(avatarId, {
                done: true,
                images: manifest.images || [],
                videos: manifest.videos || [],
                spriteSheet: manifest.spriteSheet || null,
            });
        } catch (jobErr) {
            console.error(`[AdminController] Mascot async job failed for avatar ${avatarId}:`, jobErr.message);
            mascotProgressMap.set(avatarId, { error: jobErr.message });
        } finally {
            runningMascotJobs.delete(avatarId);
        }
    })();

    return true;
}

function launchMascotPreviewJob({ previewId, avatarName, icon, selectedCandidateIndex, previewCandidateAvatarId }) {
    if (runningMascotPreviewJobs.has(previewId)) return false;
    runningMascotPreviewJobs.add(previewId);
    mascotPreviewProgressMap.set(previewId, { generating: true, index: 0, total: MASCOT_GEN_TOTAL, label: 'Initialisation', images: [], videos: [] });

    (async () => {
        try {
            const selectedMasterAbsolutePath =
                previewCandidateAvatarId && selectedCandidateIndex
                    ? mascotService.resolveCandidateAbsolutePath({
                          avatarId: previewCandidateAvatarId,
                          selectedCandidateIndex,
                      })
                    : null;
            const manifest = await mascotService.generateMascotSet({
                avatarId: previewId,
                avatarName,
                icon,
                selectedCandidateIndex,
                selectedMasterAbsolutePath,
                onProgress: (p) => {
                    const prev = mascotPreviewProgressMap.get(previewId) || { images: [], videos: [] };
                    const nextImages = mergeMediaByIndex(prev.images, p?.image);
                    const nextVideos = mergeMediaByIndex(prev.videos, p?.video);
                    mascotPreviewProgressMap.set(previewId, { ...prev, ...p, images: nextImages, videos: nextVideos });
                }
            });
            mascotPreviewProgressMap.set(previewId, {
                done: true,
                images: manifest.images || [],
                videos: manifest.videos || [],
                spriteSheet: manifest.spriteSheet || null,
                warning: manifest.warning || null
            });
        } catch (jobErr) {
            console.error(`[AdminController] Mascot preview job failed for ${previewId}:`, jobErr.message);
            mascotPreviewProgressMap.set(previewId, {
                error: jobErr.message,
                details: 'La génération a échoué. Vérifier OPENAI_API_KEY, PIXVERSE_API_KEY, et les quotas API.'
            });
        } finally {
            runningMascotPreviewJobs.delete(previewId);
        }
    })();
    return true;
}

function launchMascotCandidateJob({ avatarId, avatarName, icon }) {
    if (runningMascotCandidateJobs.has(avatarId)) return false;
    runningMascotCandidateJobs.add(avatarId);
    mascotCandidateProgressMap.set(avatarId, { generating: true, index: 0, total: mascotService.CANDIDATE_COUNT || 3, label: 'Initialisation', candidates: [] });

    (async () => {
        try {
            const result = await mascotService.generateMascotCandidates({
                avatarId,
                avatarName,
                icon,
                onProgress: (p) => {
                    const prev = mascotCandidateProgressMap.get(avatarId) || { candidates: [] };
                    mascotCandidateProgressMap.set(avatarId, { ...prev, ...p, candidates: p?.candidates || prev.candidates || [] });
                }
            });
            mascotCandidateProgressMap.set(avatarId, { done: true, candidates: result.candidates || [] });
        } catch (jobErr) {
            console.error(`[AdminController] Mascot candidates job failed for avatar ${avatarId}:`, jobErr.message);
            mascotCandidateProgressMap.set(avatarId, { error: jobErr.message });
        } finally {
            runningMascotCandidateJobs.delete(avatarId);
        }
    })();

    return true;
}

function launchMascotPreviewCandidateJob({ previewId, avatarName, icon }) {
    if (runningMascotPreviewCandidateJobs.has(previewId)) return false;
    runningMascotPreviewCandidateJobs.add(previewId);
    mascotPreviewCandidateProgressMap.set(previewId, { generating: true, index: 0, total: mascotService.CANDIDATE_COUNT || 3, label: 'Initialisation', candidates: [] });

    (async () => {
        try {
            const result = await mascotService.generateMascotCandidates({
                avatarId: previewId,
                avatarName,
                icon,
                onProgress: (p) => {
                    const prev = mascotPreviewCandidateProgressMap.get(previewId) || { candidates: [] };
                    mascotPreviewCandidateProgressMap.set(previewId, { ...prev, ...p, candidates: p?.candidates || prev.candidates || [] });
                }
            });
            mascotPreviewCandidateProgressMap.set(previewId, { done: true, candidates: result.candidates || [] });
        } catch (jobErr) {
            console.error(`[AdminController] Mascot preview candidates job failed for ${previewId}:`, jobErr.message);
            mascotPreviewCandidateProgressMap.set(previewId, { error: jobErr.message });
        } finally {
            runningMascotPreviewCandidateJobs.delete(previewId);
        }
    })();

    return true;
}

class AdminController {
    async generateMascotPreviewCandidates(req, res) {
        try {
            if (!mascotService.isConfigured()) {
                return res.status(400).json({
                    error: 'Configuration mascotte manquante : définissez OPENAI_API_KEY ou OPENROUTER_API_KEY dans .env.',
                });
            }
            const avatarName = String(req.body?.nom_avatar || 'Nouvel Expert').trim();
            const icon = String(req.body?.icone || '🤖').trim();
            const previewId = Number(Date.now());
            const started = launchMascotPreviewCandidateJob({ previewId, avatarName, icon });
            return res.status(202).json({
                success: true,
                queued: true,
                alreadyRunning: !started,
                preview_id: previewId,
            });
        } catch (err) {
            return res.status(500).json({ error: err.message || 'Erreur génération propositions mascotte.' });
        }
    }

    async getMascotPreviewCandidatesStatus(req, res) {
        try {
            const previewId = Number(req.params.previewId);
            if (!Number.isFinite(previewId) || previewId <= 0) {
                return res.status(400).json({ error: 'previewId invalide.' });
            }
            const progress = mascotPreviewCandidateProgressMap.get(previewId);
            if (progress) {
                if (progress.done || progress.error) {
                    mascotPreviewCandidateProgressMap.delete(previewId);
                }
                return res.json(progress);
            }
            if (runningMascotPreviewCandidateJobs.has(previewId)) {
                return res.json({ generating: true, index: 0, total: mascotService.CANDIDATE_COUNT || 3, label: 'Initialisation', candidates: [] });
            }
            return res.json({ not_found: true });
        } catch (err) {
            return res.status(500).json({ error: 'Erreur interne' });
        }
    }

    async generateMascotPreview(req, res) {
        try {
            if (!mascotService.isConfigured()) {
                return res.status(400).json({
                    error: 'Configuration mascotte manquante : définissez OPENAI_API_KEY ou OPENROUTER_API_KEY dans .env (et PIXVERSE_API_KEY si MASCOT_PROVIDER=pixverse).',
                });
            }
            const avatarName = String(req.body?.nom_avatar || 'Nouvel Expert').trim();
            const icon = String(req.body?.icone || '🤖').trim();
            const previewId = Number(req.body?.preview_id || req.body?.previewId || Date.now());
            const selectedCandidateIndex = Number(req.body?.selectedCandidateIndex || req.body?.selected_candidate_index || 0) || null;
            const previewCandidateAvatarId = Number(req.body?.previewCandidateAvatarId || req.body?.preview_candidate_avatar_id || 0) || null;
            const started = launchMascotPreviewJob({ previewId, avatarName, icon, selectedCandidateIndex, previewCandidateAvatarId });
            return res.status(202).json({
                success: true,
                queued: true,
                alreadyRunning: !started,
                preview_id: previewId
            });
        } catch (err) {
            return res.status(500).json({ error: err.message || 'Erreur preview mascotte.' });
        }
    }

    async getMascotPreviewStatus(req, res) {
        try {
            const previewId = Number(req.params.previewId);
            if (!Number.isFinite(previewId) || previewId <= 0) {
                return res.status(400).json({ error: 'previewId invalide.' });
            }
            const progress = mascotPreviewProgressMap.get(previewId);
            if (progress) {
                if (progress.done || progress.error) {
                    mascotPreviewProgressMap.delete(previewId);
                }
                return res.json(progress);
            }
            if (runningMascotPreviewJobs.has(previewId)) {
                return res.json({ generating: true, index: 0, total: MASCOT_GEN_TOTAL, label: 'Initialisation', images: [] });
            }
            return res.json({ not_found: true });
        } catch (err) {
            return res.status(500).json({ error: 'Erreur interne' });
        }
    }

    async getAvatars(req, res) {
        try {
            const avatars = await sessionRepository.getAllAvatars(req.user.id);
            res.json(Array.isArray(avatars) ? avatars : []);
        } catch (err) { res.json([]); }
    }

    async createAvatar(req, res) {
        try {
            const avatarId = await sessionRepository.createAvatar(req.body, req.user.id);
            res.json({ id: avatarId, message: 'Expert cree' });
        } catch (err) { res.status(500).json({ error: 'Erreur creation' }); }
    }

    async updateAvatar(req, res) {
        try {
            await sessionRepository.updateAvatar(req.params.id, req.body, req.user.id);
            res.json({ message: 'Expert mis a jour' });
        } catch (err) { res.status(500).json({ error: 'Erreur mise a jour' }); }
    }

    async generateAvatarMascot(req, res) {
        try {
            const avatarId = Number(req.params.id);
            if (!Number.isFinite(avatarId) || avatarId <= 0) {
                return res.status(400).json({ error: 'ID avatar invalide.' });
            }

            if (!mascotService.isConfigured()) {
                return res.status(400).json({
                    error: 'Configuration mascotte manquante : définissez OPENAI_API_KEY ou OPENROUTER_API_KEY dans .env (et PIXVERSE_API_KEY si MASCOT_PROVIDER=pixverse).',
                });
            }

            const avatar = await sessionRepository.getAvatarById(avatarId, req.user.id);
            if (!avatar) {
                return res.status(403).json({ error: 'Acces interdit.' });
            }

            const runAsync = ['1', 'true', 'yes'].includes(String(req.query?.async || '').toLowerCase());
            const runStream = ['1', 'true', 'yes'].includes(String(req.query?.stream || '').toLowerCase());
            const selectedCandidateIndex = Number(req.body?.selectedCandidateIndex || req.body?.selected_candidate_index || 0) || null;
            const previewCandidateAvatarId = Number(req.body?.previewCandidateAvatarId || req.body?.preview_candidate_avatar_id || 0) || null;
            const reusePreviewId = Number(req.body?.reusePreviewId || req.body?.reuse_preview_id || 0) || null;

            if (reusePreviewId) {
                const manifest = await copyPreviewMascotAndPersist({
                    previewId: reusePreviewId,
                    avatarId,
                    avatarName: avatar.nom_avatar,
                    icon: avatar.icone,
                    userId: req.user.id,
                });
                mascotProgressMap.set(avatarId, {
                    done: true,
                    images: manifest.images || [],
                    videos: manifest.videos || [],
                    spriteSheet: manifest.spriteSheet || null,
                    reusedPreviewId: reusePreviewId,
                });

                return res.status(runAsync ? 202 : 200).json({
                    success: true,
                    queued: Boolean(runAsync),
                    reusedPreviewId: reusePreviewId,
                    avatarId,
                    images: manifest.images || [],
                    videos: manifest.videos || [],
                    spriteSheet: manifest.spriteSheet || null,
                    message: 'Mascotte preview réutilisée pour cet agent.',
                });
            }

            if (runAsync) {
                const started = launchMascotGenerationJob({
                    avatarId,
                    avatarName: avatar.nom_avatar,
                    icon: avatar.icone,
                    userId: req.user.id,
                    selectedCandidateIndex,
                    previewCandidateAvatarId,
                });

                return res.status(202).json({
                    success: true,
                    queued: true,
                    alreadyRunning: !started,
                    avatarId,
                    message: started
                        ? 'Generation de la mascotte lancee en arriere-plan.'
                        : 'Generation de la mascotte deja en cours pour cet agent.',
                });
            }

            if (runStream) {
                // Ensure compression does not buffer this stream
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache, no-transform');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no');
                
                // If using a reverse proxy or compression middleware, explicitly tell it to flush
                if (req.socket) req.socket.setTimeout(0);
                
                res.flushHeaders();
                
                // Send padding to bypass proxy buffers (like Nginx) that wait for 4KB
                res.write(`: ${' '.repeat(4096)}\n\n`);
                res.write(`data: ${JSON.stringify({ generating: true, label: "Initialisation", index: 0, total: MASCOT_GEN_TOTAL })}\n\n`);
                if (res.flush) res.flush();

                const onProgress = async (progressData) => {
                    res.write(`data: ${JSON.stringify(progressData)}\n\n`);
                    // Flush buffer if using compression
                    if (res.flush) res.flush();
                };

                try {
                    const manifest = await generateMascotAndPersist({
                        avatarId,
                        avatarName: avatar.nom_avatar,
                        icon: avatar.icone,
                        userId: req.user.id,
                        selectedCandidateIndex,
                        previewCandidateAvatarId,
                        onProgress
                    });
                    
                    res.write(`data: ${JSON.stringify({ done: true, images: manifest.images || [], videos: manifest.videos || [], spriteSheet: manifest.spriteSheet || null })}\n\n`);
                    if (res.flush) res.flush();
                    res.end();
                } catch (err) {
                    res.write(`data: ${JSON.stringify({ error: err.message || 'Erreur generation mascotte.' })}\n\n`);
                    if (res.flush) res.flush();
                    res.end();
                }
                return;
            }

            const manifest = await generateMascotAndPersist({
                avatarId,
                avatarName: avatar.nom_avatar,
                icon: avatar.icone,
                userId: req.user.id,
                selectedCandidateIndex,
                previewCandidateAvatarId,
            });

            return res.json({
                success: true,
                message: `Mascotte generee avec ${MASCOT_GEN_TOTAL} poses (grille ${MASCOT_GEN_COLS}x${MASCOT_GEN_ROWS}).`,
                avatarId,
                images: manifest.images,
                videos: manifest.videos || [],
                spriteSheet: manifest.spriteSheet || null,
                generatedAt: manifest.generatedAt,
                model: manifest.model,
            });
        } catch (err) {
            console.error('[AdminController] generateAvatarMascot:', err.message);
            return res.status(err.status || 500).json({ error: err.message || 'Erreur generation mascotte.' });
        }
    }

    async generateAvatarMascotCandidates(req, res) {
        try {
            const avatarId = Number(req.params.id);
            if (!Number.isFinite(avatarId) || avatarId <= 0) {
                return res.status(400).json({ error: 'ID avatar invalide.' });
            }
            if (!mascotService.isConfigured()) {
                return res.status(400).json({
                    error: 'Configuration mascotte manquante : définissez OPENAI_API_KEY ou OPENROUTER_API_KEY dans .env.',
                });
            }
            const avatar = await sessionRepository.getAvatarById(avatarId, req.user.id);
            if (!avatar) {
                return res.status(403).json({ error: 'Acces interdit.' });
            }

            const started = launchMascotCandidateJob({
                avatarId,
                avatarName: avatar.nom_avatar,
                icon: avatar.icone,
            });

            return res.status(202).json({
                success: true,
                queued: true,
                alreadyRunning: !started,
                avatarId,
            });
        } catch (err) {
            console.error('[AdminController] generateAvatarMascotCandidates:', err.message);
            return res.status(err.status || 500).json({ error: err.message || 'Erreur propositions mascotte.' });
        }
    }

    async getMascotCandidatesStatus(req, res) {
        try {
            const avatarId = Number(req.params.id);
            if (!Number.isFinite(avatarId) || avatarId <= 0) {
                return res.status(400).json({ error: 'ID avatar invalide.' });
            }
            const progress = mascotCandidateProgressMap.get(avatarId);
            if (progress) {
                if (progress.done || progress.error) {
                    mascotCandidateProgressMap.delete(avatarId);
                }
                return res.json(progress);
            }
            if (runningMascotCandidateJobs.has(avatarId)) {
                return res.json({ generating: true, index: 0, total: mascotService.CANDIDATE_COUNT || 3, label: 'Initialisation', candidates: [] });
            }
            return res.json({ not_found: true });
        } catch (err) {
            console.error('getMascotCandidatesStatus Error:', err);
            return res.status(500).json({ error: 'Erreur interne' });
        }
    }

    async getMascotStatus(req, res) {
        try {
            const avatarId = Number(req.params.id);
            if (!Number.isFinite(avatarId) || avatarId <= 0) {
                return res.status(400).json({ error: 'ID avatar invalide.' });
            }
            
            const progress = mascotProgressMap.get(avatarId);
            if (progress) {
                if (progress.done) {
                    mascotProgressMap.delete(avatarId);
                }
                return res.json(progress);
            }
            
            if (runningMascotJobs.has(avatarId)) {
                return res.json({ generating: true, index: 0, total: MASCOT_GEN_TOTAL, label: 'Initialisation' });
            }
            
            return res.json({ not_found: true });
        } catch(err) {
            console.error('getMascotStatus Error:', err);
            return res.status(500).json({ error: 'Erreur interne' });
        }
    }

    async deleteAvatar(req, res) {
        try {
            await sessionRepository.deleteAvatar(req.params.id, req.user.id);
            res.json({ message: 'Expert supprime' });
        } catch (err) { res.status(500).json({ error: 'Erreur suppression' }); }
    }

    async uploadRagDocument(req, res) {
        if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
        try {
            const avatarId = Number(req.body?.avatar_id);
            const avatar = await sessionRepository.getAvatarById(avatarId, req.user.id);
            if (!avatar) {
                if (req.file?.path) fs.unlinkSync(req.file.path);
                return res.status(403).json({ error: 'Acces interdit' });
            }
            const uuid = uuidv4();
            const count = await documentProcessor.processPDF(req.file.path, {
                uuid,
                filename: req.file.originalname,
                avatar_id: avatarId
            }, avatarId);

            await ragDocumentRepository.create({
                uuid,
                filename: req.file.originalname,
                status: 'success',
                chunk_count: count,
                avatar_id: avatarId
            });
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.json({ success: true, message: 'Indexe', uuid });
        } catch (err) {
            if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.status(500).json({ error: err.message });
        }
    }

    async listRagDocuments(req, res) {
        try {
            const docs = await ragDocumentRepository.findAll();
            res.json({ configured: true, documents: docs });
        } catch (err) { res.status(500).json({ error: err.message }); }
    }

    async deleteRagDocument(req, res) {
        try {
            const doc = await ragDocumentRepository.findByUuid(req.params.id);
            if (!doc) return res.status(404).json({ error: 'Inconnu' });
            const avatar = await sessionRepository.getAvatarById(doc.avatar_id, req.user.id);
            if (!avatar) return res.status(403).json({ error: 'Interdit' });
            await vectorStoreService.deleteDocumentsByUuid(req.params.id, doc.avatar_id);
            await ragDocumentRepository.deleteByUuid(req.params.id);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    }

    async uploadExcelFile(req, res) {
        if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
        try {
            const avatarId = Number(req.body?.avatar_id);
            const avatar = await sessionRepository.getAvatarById(avatarId, req.user.id);
            if (!avatar) {
                if (req.file?.path) fs.unlinkSync(req.file.path);
                return res.status(403).json({ error: 'Acces refuse.' });
            }
            const result = await excelService.processExcelFile(req.file.path, req.file.originalname, avatarId);
            res.json({ success: true, ...result });
        } catch (err) {
            if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new AdminController();
