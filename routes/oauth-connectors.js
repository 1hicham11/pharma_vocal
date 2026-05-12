const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const pool = require('../db/connection');
const documentProcessor = require('../services/langchain/documentProcessor');
const excelService = require('../services/langchain/excelService');
const ragDocumentRepository = require('../repositories/ragDocumentRepository');
const sessionRepository = require('../repositories/sessionRepository');

const router = express.Router();
const apiOnly = process.env.API_ONLY === '1' || process.env.API_ONLY === 'true';
const frontendOrigin = (process.env.FRONTEND_ORIGIN || '').replace(/\/$/, '');

function publicBaseUrl(req) {
  return (
    process.env.OAUTH_REDIRECT_BASE ||
    `${req.protocol}://${req.get('host')}`
  ).replace(/\/$/, '');
}

function callbackUrl(req) {
  return `${publicBaseUrl(req)}/api/oauth/connectors/callback`;
}

function requireUser(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Connexion requise' });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'JWT_SECRET manquant' });
  }
  try {
    req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session invalide' });
  }
}

/** Config par clé = slug utilisé par le front (GET .../start/:slug) */
const PROVIDERS = {
  google_documents: {
    label: 'Google (Drive)',
    envKeys: ['OAUTH_GOOGLE_CLIENT_ID', 'OAUTH_GOOGLE_CLIENT_SECRET'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: () => process.env.OAUTH_GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.OAUTH_GOOGLE_CLIENT_SECRET,
    buildScopes: () =>
      process.env.OAUTH_GOOGLE_SCOPES ||
      'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.metadata.readonly openid email',
    extraAuthParams: () => ({
      access_type: 'offline',
      prompt: 'consent',
    }),
  },
  microsoft_sso: {
    label: 'Microsoft (Entra ID)',
    envKeys: ['OAUTH_MICROSOFT_CLIENT_ID', 'OAUTH_MICROSOFT_CLIENT_SECRET'],
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: () => process.env.OAUTH_MICROSOFT_CLIENT_ID,
    clientSecret: () => process.env.OAUTH_MICROSOFT_CLIENT_SECRET,
    buildScopes: () =>
      process.env.OAUTH_MICROSOFT_SCOPES ||
      'openid profile offline_access User.Read',
    extraAuthParams: () => ({}),
  },
  notion: {
    label: 'Notion',
    envKeys: ['OAUTH_NOTION_CLIENT_ID', 'OAUTH_NOTION_CLIENT_SECRET'],
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientId: () => process.env.OAUTH_NOTION_CLIENT_ID,
    clientSecret: () => process.env.OAUTH_NOTION_CLIENT_SECRET,
    buildScopes: () => '',
    extraAuthParams: () => ({ owner: 'user' }),
  },
  slack: {
    label: 'Slack',
    envKeys: ['OAUTH_SLACK_CLIENT_ID', 'OAUTH_SLACK_CLIENT_SECRET'],
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    clientId: () => process.env.OAUTH_SLACK_CLIENT_ID,
    clientSecret: () => process.env.OAUTH_SLACK_CLIENT_SECRET,
    buildScopes: () => process.env.OAUTH_SLACK_BOT_SCOPES || 'channels:read,chat:write',
    extraAuthParams: () => ({
      user_scope: process.env.OAUTH_SLACK_USER_SCOPES || '',
    }),
  },
  hubspot: {
    label: 'HubSpot',
    envKeys: ['OAUTH_HUBSPOT_CLIENT_ID', 'OAUTH_HUBSPOT_CLIENT_SECRET'],
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    clientId: () => process.env.OAUTH_HUBSPOT_CLIENT_ID,
    clientSecret: () => process.env.OAUTH_HUBSPOT_CLIENT_SECRET,
    buildScopes: () =>
      process.env.OAUTH_HUBSPOT_SCOPES || 'oauth crm.objects.contacts.read',
    extraAuthParams: () => ({}),
  },
  zoom: {
    label: 'Zoom',
    envKeys: ['OAUTH_ZOOM_CLIENT_ID', 'OAUTH_ZOOM_CLIENT_SECRET'],
    authUrl: process.env.OAUTH_ZOOM_AUTH_URL || 'https://zoom.us/oauth/authorize',
    tokenUrl: process.env.OAUTH_ZOOM_TOKEN_URL || 'https://zoom.us/oauth/token',
    clientId: () => process.env.OAUTH_ZOOM_CLIENT_ID,
    clientSecret: () => process.env.OAUTH_ZOOM_CLIENT_SECRET,
    // Granular scopes : éviter user:read:admin sur une app User-managed (« périmètre non valide »).
    // Minimal : user:read:user. Création de réunions : meeting:write:meeting.
    buildScopes: () =>
      process.env.OAUTH_ZOOM_SCOPES ||
      'user:read:user meeting:read:list_meetings meeting:write:meeting cloud_recording:read:list_user_recordings',
    extraAuthParams: () => ({}),
  },
  elevenlabs: {
    label: 'ElevenLabs',
    envKeys: ['OAUTH_ELEVENLABS_CLIENT_ID', 'OAUTH_ELEVENLABS_CLIENT_SECRET'],
    authUrl: process.env.OAUTH_ELEVENLABS_AUTH_URL || 'https://elevenlabs.io/oauth/authorize',
    tokenUrl: process.env.OAUTH_ELEVENLABS_TOKEN_URL || 'https://api.elevenlabs.io/v1/oauth/token',
    clientId: () => process.env.OAUTH_ELEVENLABS_CLIENT_ID,
    clientSecret: () => process.env.OAUTH_ELEVENLABS_CLIENT_SECRET,
    buildScopes: () =>
      process.env.OAUTH_ELEVENLABS_SCOPES || 'voices:read text_to_speech:generate',
    extraAuthParams: () => ({}),
  },
};

function missingEnv(cfg) {
  const miss = [];
  const idKey = (cfg.envKeys && cfg.envKeys[0]) || 'CLIENT_ID';
  const secretKey = (cfg.envKeys && cfg.envKeys[1]) || 'CLIENT_SECRET';
  if (!cfg.clientId()) miss.push(idKey);
  if (!cfg.clientSecret()) miss.push(secretKey);
  return miss.length ? miss : null;
}

function signState(userId, provider, returnTo = '') {
  return jwt.sign(
    { uid: userId, p: provider, t: 'oauth_connect', rt: returnTo || '' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function sanitizeReturnTo(input) {
  const val = String(input || '').trim();
  if (!val.startsWith('/')) return '';
  if (val.startsWith('//')) return '';
  if (
    !val.startsWith('/agent-knowledge.html') &&
    !val.startsWith('/personalize.html') &&
    !val.startsWith('/meeting-translate.html') &&
    !val.startsWith('/meeting-translate')
  ) return '';
  return val;
}

function inferReturnToFromReferer(req) {
  const ref = String(req.get('referer') || '').trim();
  if (!ref) return '';
  try {
    const parsed = new URL(ref);
    return sanitizeReturnTo(`${parsed.pathname}${parsed.search || ''}`);
  } catch {
    return '';
  }
}

function redirectFront(res, query, returnTo = '') {
  const q = new URLSearchParams(query).toString();
  const safeReturnTo = sanitizeReturnTo(returnTo);
  if (safeReturnTo) {
    const hasQuery = safeReturnTo.includes('?');
    const prefix = apiOnly && frontendOrigin && safeReturnTo.startsWith('/meeting-translate')
      ? frontendOrigin
      : '';
    return res.redirect(`${prefix}${safeReturnTo}${hasQuery ? '&' : '?'}${q}`);
  }
  return res.redirect(`/personalize.html?tab=hub&${q}`);
}

router.get('/status', requireUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT provider, created_at, updated_at FROM oauth_connections WHERE user_id = ?',
      [req.user.id]
    );
    return res.json({ connections: rows });
  } catch (err) {
    console.error('[OAuth connectors] status', err.message);
    return res.json({ connections: [] });
  }
});

router.delete('/disconnect/:provider', requireUser, async (req, res) => {
  const provider = String(req.params.provider || '').trim();
  if (!provider) {
    return res.status(400).json({ error: 'provider_manquant' });
  }
  
  try {
    await pool.query(
      'DELETE FROM oauth_connections WHERE user_id = ? AND provider = ?',
      [req.user.id, provider]
    );
    return res.json({ success: true, message: 'Déconnecté avec succès' });
  } catch (err) {
    console.error('[OAuth connectors] disconnect', err.message);
    return res.status(500).json({ error: 'disconnect_failed' });
  }
});

router.get('/start/:provider', requireUser, (req, res) => {
  const raw = req.params.provider;
  const provider = typeof raw === 'string' ? raw.trim() : '';
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    return res.status(404).json({
      error: 'Connecteur inconnu',
      slug: provider || raw,
      slugs: Object.keys(PROVIDERS),
      hint: 'Redémarrez le serveur (node server.js) après une mise à jour des connecteurs.',
    });
  }
  const miss = missingEnv(cfg);
  if (miss) {
    return res.status(503).json({
      error: 'Connecteur non configuré (variables OAuth manquantes)',
      provider,
      missingEnv: miss,
      doc: 'Voir env.oauth.example à la racine du projet.',
    });
  }

  const redirectUri = callbackUrl(req);
  const returnTo = sanitizeReturnTo(req.query.return_to) || inferReturnToFromReferer(req);
  const state = signState(req.user.id, provider, returnTo);

  const params = new URLSearchParams({
    client_id: cfg.clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    ...cfg.extraAuthParams(),
  });

  const scopes = cfg.buildScopes();
  if (scopes) params.set('scope', scopes);

  for (const [k, v] of [...params.entries()]) {
    if (v === '') params.delete(k);
  }

  const url = `${cfg.authUrl}?${params.toString()}`;
  const body = { url, redirect_uri: redirectUri };
  if (provider === 'zoom') {
    body.hint =
      'Si Zoom affiche « Application not found » : soit le compte Zoom n’est pas autorisé à installer cette app (compte hors organisation / app pas encore listée sur le Marketplace), soit le redirect_uri ne correspond pas exactement à celui enregistré en Production. Compte développeur propriétaire de l’app : vérifiez OAUTH_ZOOM_CLIENT_ID et redémarrez le serveur. Comptes EU : essayez OAUTH_ZOOM_AUTH_URL=https://zoom.eu/oauth/authorize et OAUTH_ZOOM_TOKEN_URL=https://zoom.eu/oauth/token .';
  }
  return res.json(body);
});

async function exchangeCode(provider, code, redirectUri) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error('unknown_provider');

  if (provider === 'notion') {
    const id = cfg.clientId();
    const secret = cfg.clientSecret();
    const basic = Buffer.from(`${id}:${secret}`).toString('base64');
    const { data } = await axios.post(
      cfg.tokenUrl,
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      },
      {
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_in: null,
      token_type: data.token_type || 'bearer',
      scope: null,
      extra: {
        workspace_id: data.workspace_id,
        workspace_name: data.workspace_name,
        workspace_icon: data.workspace_icon,
        bot_id: data.bot_id,
      },
    };
  }

  if (provider === 'slack') {
    const body = new URLSearchParams({
      client_id: cfg.clientId(),
      client_secret: cfg.clientSecret(),
      code,
      redirect_uri: redirectUri,
    });
    const { data } = await axios.post(cfg.tokenUrl, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!data.ok) {
      throw new Error(data.error || 'slack_oauth_failed');
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_in: data.expires_in || null,
      token_type: 'Bearer',
      scope: data.scope,
      extra: {
        team_id: data.team?.id,
        team_name: data.team?.name,
        authed_user: data.authed_user,
      },
    };
  }

  if (provider === 'zoom') {
    const basic = Buffer.from(`${cfg.clientId()}:${cfg.clientSecret()}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    const { data } = await axios.post(cfg.tokenUrl, body.toString(), {
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_in: data.expires_in,
      token_type: data.token_type || 'Bearer',
      scope: data.scope,
      extra: data.user_id != null ? { zoom_user_id: String(data.user_id) } : null,
    };
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.clientId(),
    client_secret: cfg.clientSecret(),
    code,
    redirect_uri: redirectUri,
  });

  const { data } = await axios.post(cfg.tokenUrl, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    expires_in: data.expires_in,
    token_type: data.token_type,
    scope: data.scope,
    extra: null,
  };
}

router.get('/callback', async (req, res) => {
  const { code, state, error, error_description: errDesc } = req.query;

  if (error) {
    return redirectFront(res, {
      oauth_error: String(error),
      oauth_detail: errDesc ? String(errDesc) : '',
    });
  }
  if (!code || !state) {
    return redirectFront(res, { oauth_error: 'missing_code_or_state' });
  }
  if (!process.env.JWT_SECRET) {
    return redirectFront(res, { oauth_error: 'server_misconfigured' });
  }

  let payload;
  try {
    payload = jwt.verify(state, process.env.JWT_SECRET);
  } catch {
    return redirectFront(res, { oauth_error: 'invalid_state' });
  }

  if (payload.t !== 'oauth_connect' || !payload.uid || !payload.p) {
    return redirectFront(res, { oauth_error: 'bad_state' });
  }

  const provider = payload.p;
  const userId = payload.uid;
  const returnTo = sanitizeReturnTo(payload.rt);
  const redirectUri = callbackUrl(req);

  let tokens;
  try {
    tokens = await exchangeCode(provider, code, redirectUri);
  } catch (e) {
    console.error('[OAuth connectors] token exchange', provider, e.response?.data || e.message);
    return redirectFront(res, { oauth_error: 'token_exchange_failed' }, returnTo);
  }

  const expiresAt =
    tokens.expires_in != null
      ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
      : null;

  const rowId = uuidv4();
  try {
    await pool.query(
      `INSERT INTO oauth_connections (id, user_id, provider, access_token, refresh_token, expires_at, token_type, scope, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         access_token = VALUES(access_token),
         refresh_token = COALESCE(VALUES(refresh_token), refresh_token),
         expires_at = VALUES(expires_at),
         token_type = VALUES(token_type),
         scope = VALUES(scope),
         extra = VALUES(extra),
         updated_at = CURRENT_TIMESTAMP`,
      [
        rowId,
        userId,
        provider,
        tokens.access_token,
        tokens.refresh_token,
        expiresAt,
        tokens.token_type,
        tokens.scope,
        tokens.extra ? JSON.stringify(tokens.extra) : null,
      ]
    );
  } catch (err) {
    console.error('[OAuth connectors] DB save', err.message);
    return redirectFront(res, { oauth_error: 'db_save_failed' }, returnTo);
  }

  const extra = {};
  if (provider === 'google_documents' && returnTo.startsWith('/agent-knowledge.html')) {
    extra.drive_pick = '1';
  }
  return redirectFront(res, { oauth_ok: '1', oauth_provider: provider, ...extra }, returnTo);
});

async function getOauthConnection(userId, provider) {
  const [rows] = await pool.query(
    'SELECT access_token, refresh_token, expires_at FROM oauth_connections WHERE user_id = ? AND provider = ? LIMIT 1',
    [userId, provider]
  );
  return rows?.[0] || null;
}

async function refreshGoogleAccessToken(userId, conn) {
  if (!conn?.refresh_token) return null;
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.OAUTH_GOOGLE_CLIENT_ID || '',
      client_secret: process.env.OAUTH_GOOGLE_CLIENT_SECRET || '',
      refresh_token: conn.refresh_token,
    });
    const { data } = await axios.post('https://oauth2.googleapis.com/token', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const nextAccessToken = data?.access_token;
    if (!nextAccessToken) return null;
    const nextExpiresAt = data?.expires_in
      ? new Date(Date.now() + Number(data.expires_in) * 1000)
      : null;
    await pool.query(
      `UPDATE oauth_connections
       SET access_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND provider = 'google_documents'`,
      [nextAccessToken, nextExpiresAt, userId]
    );
    return nextAccessToken;
  } catch (e) {
    console.error('[OAuth connectors] google refresh failed', e.response?.data || e.message);
    return null;
  }
}

async function getGoogleAccessToken(userId, { forceRefresh = false } = {}) {
  const conn = await getOauthConnection(userId, 'google_documents');
  if (!conn?.access_token) {
    const err = new Error('google_not_connected');
    err.status = 404;
    throw err;
  }
  if (forceRefresh) {
    const refreshed = await refreshGoogleAccessToken(userId, conn);
    return refreshed || conn.access_token;
  }
  return conn.access_token;
}

function isGoogleAuthError(err) {
  const status = err?.response?.status || err?.status;
  return status === 401 || status === 403;
}

async function callGoogleDriveWithRetry(userId, fn) {
  let token = await getGoogleAccessToken(userId);
  try {
    return await fn(token);
  } catch (err) {
    if (!isGoogleAuthError(err)) throw err;
    const refreshed = await getGoogleAccessToken(userId, { forceRefresh: true });
    if (!refreshed || refreshed === token) throw err;
    token = refreshed;
    return await fn(token);
  }
}

function extractGoogleErrorDetail(err) {
  const data = err?.response?.data;
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data?.error?.message) return String(data.error.message);
  try {
    return JSON.stringify(data);
  } catch {
    return '';
  }
}

router.get('/google-documents/files', requireUser, async (req, res) => {
  try {
    const pageSize = Math.max(1, Math.min(50, Number(req.query.page_size || 20)));
    const mode = String(req.query.mode || 'recent').trim().toLowerCase();
    const parentId = String(req.query.parent_id || '').trim();
    const qText = String(req.query.q || '').trim();
    let baseFilter = 'trashed=false';
    if (mode === 'drive') {
      const scopedParent = parentId || 'root';
      baseFilter = `'${scopedParent.replace(/'/g, "\\'")}' in parents and trashed=false`;
    }
    const searchFilter = qText ? ` and name contains '${qText.replace(/'/g, "\\'")}'` : '';
    const q = `${baseFilter}${searchFilter}`;

    const { data } = await callGoogleDriveWithRetry(req.user.id, async (token) => {
      return axios.get('https://www.googleapis.com/drive/v3/files', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          pageSize,
          fields: 'files(id,name,mimeType,modifiedTime,size,parents,capabilities/canDownload),nextPageToken',
          orderBy: mode === 'drive' ? 'folder,name_natural' : 'modifiedTime desc',
          q,
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
        },
      });
    });

    const rawFiles = Array.isArray(data?.files) ? data.files : [];
    const files = rawFiles.filter(isDriveFileSupported);
    return res.json({
      files,
      nextPageToken: data?.nextPageToken || null,
      mode,
      parentId: parentId || null,
    });
  } catch (err) {
    const status = err.status || err.response?.status || 500;
    const googleMsg = err?.response?.data?.error?.message || '';
    const code = status === 404 ? 'google_not_connected' : 'google_list_failed';
    return res.status(status).json({ error: code, detail: googleMsg });
  }
});

function exportInfoForMimeType(mimeType, originalName) {
  if (!mimeType) return null;
  if (mimeType === 'application/vnd.google-apps.document') return { mime: 'application/pdf', ext: '.pdf' };
  if (mimeType === 'application/vnd.google-apps.presentation') return { mime: 'application/pdf', ext: '.pdf' };
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' };
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (ext) return { mime: '', ext };
  return null;
}

const SUPPORTED_FILE_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.md', '.xlsx', '.xls']);
const GOOGLE_WORKSPACE_SUPPORTED_MIME = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
]);
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

function isDriveFileSupported(file) {
  const mimeType = String(file?.mimeType || '');
  if (mimeType === DRIVE_FOLDER_MIME) return true;
  if (GOOGLE_WORKSPACE_SUPPORTED_MIME.has(mimeType)) return true;
  const ext = path.extname(String(file?.name || '')).toLowerCase();
  return SUPPORTED_FILE_EXTENSIONS.has(ext);
}

router.post('/google-documents/import', requireUser, async (req, res) => {
  let avatarId = Number(req.body?.avatar_id);
  const sessionId = String(req.body?.session_id || '').trim();
  const fileId = String(req.body?.file_id || '').trim();
  const fileNameHint = String(req.body?.file_name || '').trim();
  if (!fileId) return res.status(400).json({ error: 'file_id_manquant' });

  let tmpFilePath = '';
  try {
    let sessionRow = null;
    if (sessionId) {
      const [sessionRows] = await pool.query(
        'SELECT id, avatar_id FROM SESSIONS_ASSISTANCE WHERE id = ? AND user_id = ? LIMIT 1',
        [sessionId, req.user.id]
      );
      sessionRow = sessionRows?.[0] || null;
      // Si la session est invalide (lien ancien), on ne bloque pas l'import.
      // On continue avec avatar_id fourni par le client.
      if (sessionRow) {
        const sessionAvatarId = Number(sessionRow.avatar_id);
        if (Number.isFinite(sessionAvatarId) && sessionAvatarId > 0) {
          avatarId = sessionAvatarId;
        }
      }
    }

    if (!Number.isFinite(avatarId) || avatarId <= 0) {
      return res.status(400).json({ error: 'avatar_id_invalide', detail: 'Aucun agent sélectionné pour cet import.' });
    }

    const { data: meta } = await callGoogleDriveWithRetry(req.user.id, async (token) => {
      return axios.get(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: 'id,name,mimeType,resourceKey,capabilities/canDownload', supportsAllDrives: true },
      });
    });

    const exportInfo = exportInfoForMimeType(meta?.mimeType, meta?.name || fileNameHint);
    if (!exportInfo || !SUPPORTED_FILE_EXTENSIONS.has(String(exportInfo.ext || '').toLowerCase())) {
      return res.status(400).json({
        error: 'type_fichier_non_supporte',
        detail: 'Formats supportés: PDF, DOC/DOCX, TXT/MD, XLS/XLSX, Google Docs/Sheets/Slides.',
      });
    }

    if (!exportInfo.mime && meta?.capabilities?.canDownload === false) {
      return res.status(400).json({
        error: 'google_download_forbidden',
        detail: 'Google Drive refuse le téléchargement de ce fichier (droits insuffisants ou restriction propriétaire).',
      });
    }

    const tmpDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const finalNameBase = String(meta?.name || fileNameHint || 'drive-file').trim() || 'drive-file';
    const finalName = `${finalNameBase}${exportInfo.ext}`;
    tmpFilePath = path.join(tmpDir, `${Date.now()}-${Math.round(Math.random() * 1e9)}${exportInfo.ext}`);

    const downloadUrl = exportInfo.mime
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;

    const response = await callGoogleDriveWithRetry(req.user.id, async (token) => {
      const baseParams = exportInfo.mime
        ? { mimeType: exportInfo.mime }
        : { alt: 'media', supportsAllDrives: true, acknowledgeAbuse: true };
      if (meta?.resourceKey) baseParams.resourceKey = String(meta.resourceKey);
      return axios.get(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
        params: baseParams,
        responseType: 'arraybuffer',
      });
    });
    fs.writeFileSync(tmpFilePath, Buffer.from(response.data));

    if (exportInfo.ext === '.xlsx' || exportInfo.ext === '.xls') {
      const result = await excelService.processExcelFile(tmpFilePath, finalName, avatarId);
      return res.json({ success: true, imported: true, source: 'google_drive', ...result });
    }

    const uuid = uuidv4();
    const count = await documentProcessor.processPDF(tmpFilePath, {
      uuid,
      filename: finalName,
      avatar_id: avatarId
    }, avatarId);

    await ragDocumentRepository.create({
      uuid,
      filename: finalName,
      status: 'success',
      chunk_count: count,
      avatar_id: avatarId
    });

    return res.json({ success: true, imported: true, source: 'google_drive', uuid });
  } catch (err) {
    const status = err.status || err.response?.status || 500;
    const message = err.message || err.response?.data?.error || 'google_import_failed';
    const detail = extractGoogleErrorDetail(err);
    return res.status(status).json({ error: message, detail });
  } finally {
    if (tmpFilePath && fs.existsSync(tmpFilePath)) {
      try { fs.unlinkSync(tmpFilePath); } catch {}
    }
  }
});

console.log('[OAuth connectors] Connecteurs OAuth chargés :', Object.keys(PROVIDERS).join(', '));

module.exports = router;
