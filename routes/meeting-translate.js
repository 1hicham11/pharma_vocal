const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const OpenAI = require('openai');
const authenticateToken = require('../middleware/auth');
const pool = require('../db/connection');

const router = express.Router();
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

const LANGUAGE_LABELS = {
  fr: 'francais',
  en: 'anglais',
  ar: 'arabe',
  es: 'espagnol',
  de: 'allemand',
  it: 'italien',
  pt: 'portugais',
  nl: 'neerlandais',
};

function normalizeLang(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return 'fr';
  return value.split('-')[0];
}

function uniqueTargets(targets, sourceLang) {
  const seen = new Set();
  return (Array.isArray(targets) ? targets : [])
    .map((target) => ({
      lang: normalizeLang(target?.lang || target),
      label: String(target?.label || '').trim(),
    }))
    .filter((target) => {
      if (!target.lang || target.lang === sourceLang || seen.has(target.lang)) return false;
      seen.add(target.lang);
      return true;
    });
}

function safeParseJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

function sanitizeRoomId(value) {
  const room = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return room || 'default';
}

function hasZoomMeetingWriteScope(scope) {
  const scopes = String(scope || '').split(/[\s,]+/).filter(Boolean);
  return scopes.some((item) => item === 'meeting:write' || item === 'meeting:write:meeting');
}

function isTokenExpiring(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now() + 60_000;
}

async function getZoomConnection(userId) {
  const [rows] = await pool.query(
    `SELECT access_token, refresh_token, expires_at, token_type, scope, updated_at
     FROM oauth_connections
     WHERE user_id = ? AND provider = 'zoom'
     LIMIT 1`,
    [userId]
  );
  return rows?.[0] || null;
}

async function refreshZoomAccessToken(userId, conn) {
  if (!conn?.refresh_token) return null;
  if (!process.env.OAUTH_ZOOM_CLIENT_ID || !process.env.OAUTH_ZOOM_CLIENT_SECRET) return null;

  const basic = Buffer.from(`${process.env.OAUTH_ZOOM_CLIENT_ID}:${process.env.OAUTH_ZOOM_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: conn.refresh_token,
  });

  const { data } = await axios.post('https://zoom.us/oauth/token', body.toString(), {
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const nextExpiresAt = data?.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000)
    : null;

  await pool.query(
    `UPDATE oauth_connections
     SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expires_at = ?, token_type = ?, scope = COALESCE(?, scope), updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND provider = 'zoom'`,
    [
      data.access_token,
      data.refresh_token || null,
      nextExpiresAt,
      data.token_type || conn.token_type || 'Bearer',
      data.scope || null,
      userId,
    ]
  );

  return {
    ...conn,
    access_token: data.access_token,
    refresh_token: data.refresh_token || conn.refresh_token,
    expires_at: nextExpiresAt,
    token_type: data.token_type || conn.token_type || 'Bearer',
    scope: data.scope || conn.scope,
  };
}

async function getZoomAccessToken(userId) {
  const conn = await getZoomConnection(userId);
  if (!conn?.access_token) {
    const err = new Error('zoom_not_connected');
    err.status = 404;
    throw err;
  }
  if (isTokenExpiring(conn.expires_at)) {
    try {
      const refreshed = await refreshZoomAccessToken(userId, conn);
      if (refreshed?.access_token) return refreshed;
    } catch (err) {
      console.error('[MeetingTranslate] zoom refresh failed:', err.response?.data || err.message);
    }
  }
  return conn;
}

function zoomErrorPayload(err) {
  const status = err.status || err.response?.status || 500;
  const zoomData = err.response?.data || {};
  if (err.message === 'zoom_not_connected') {
    return { status: 404, body: { error: 'zoom_not_connected' } };
  }
  if (status === 401) {
    return { status, body: { error: 'zoom_token_expired', detail: zoomData.message || '' } };
  }
  if (status === 403) {
    return { status, body: { error: 'zoom_scope_missing', detail: zoomData.message || '' } };
  }
  return {
    status,
    body: {
      error: 'zoom_meeting_failed',
      detail: zoomData.message || err.message || '',
    },
  };
}

function zoomMeetingSdkCredentials() {
  const clientId = process.env.ZOOM_MEETING_SDK_CLIENT_ID || process.env.ZOOM_MEETING_SDK_KEY || process.env.OAUTH_ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_MEETING_SDK_CLIENT_SECRET || process.env.ZOOM_MEETING_SDK_SECRET || process.env.OAUTH_ZOOM_CLIENT_SECRET;
  return { clientId, clientSecret };
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signMeetingSdkJwt({ meetingNumber, role }) {
  const { clientId, clientSecret } = zoomMeetingSdkCredentials();
  if (!clientId || !clientSecret) {
    const err = new Error('zoom_meeting_sdk_missing');
    err.status = 503;
    throw err;
  }

  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    appKey: clientId,
    mn: String(meetingNumber),
    role,
    iat,
    exp,
    tokenExp: exp,
  };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', clientSecret)
    .update(unsigned)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return {
    sdkKey: clientId,
    signature: `${unsigned}.${signature}`,
  };
}

router.get('/zoom/status', authenticateToken, async (req, res) => {
  try {
    const conn = await getZoomConnection(req.user.id);
    if (!conn?.access_token) {
      return res.json({ connected: false });
    }
    return res.json({
      connected: true,
      canCreateMeetings: hasZoomMeetingWriteScope(conn.scope),
      scope: conn.scope || '',
      expiresAt: conn.expires_at || null,
      updatedAt: conn.updated_at || null,
    });
  } catch (err) {
    console.error('[MeetingTranslate] zoom status failed:', err.message);
    return res.status(500).json({ error: 'zoom_status_failed' });
  }
});

router.post('/zoom/meeting', authenticateToken, async (req, res) => {
  try {
    const conn = await getZoomAccessToken(req.user.id);
    const roomId = sanitizeRoomId(req.body?.roomId || req.body?.room);
    const topic = String(req.body?.topic || `Discussion Voxeleon - ${roomId}`).trim().slice(0, 200);
    const duration = Math.max(15, Math.min(240, Number(req.body?.duration || 60)));

    const { data } = await axios.post(
      `${ZOOM_API_BASE}/users/me/meetings`,
      {
        topic,
        type: 2,
        start_time: new Date(Date.now() + 60_000).toISOString(),
        duration,
        timezone: 'UTC',
        agenda: `Salle Voxeleon: ${roomId}`,
        settings: {
          join_before_host: true,
          waiting_room: false,
          approval_type: 2,
          audio: 'both',
          auto_recording: 'none',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${conn.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return res.json({
      meeting: {
        id: data.id,
        uuid: data.uuid,
        topic: data.topic,
        startUrl: data.start_url,
        joinUrl: data.join_url,
        password: data.password || '',
        createdAt: data.created_at || new Date().toISOString(),
        roomId,
      },
    });
  } catch (err) {
    console.error('[MeetingTranslate] zoom meeting failed:', err.response?.data || err.message);
    const payload = zoomErrorPayload(err);
    return res.status(payload.status).json(payload.body);
  }
});

router.post('/zoom/signature', authenticateToken, async (req, res) => {
  const meetingNumber = String(req.body?.meetingNumber || req.body?.meetingId || '').replace(/\D/g, '');
  const role = Number(req.body?.role) === 1 ? 1 : 0;
  if (!meetingNumber) {
    return res.status(400).json({ error: 'meeting_number_required' });
  }

  try {
    return res.json(signMeetingSdkJwt({ meetingNumber, role }));
  } catch (err) {
    console.error('[MeetingTranslate] zoom sdk signature failed:', err.message);
    return res.status(err.status || 500).json({ error: err.message || 'zoom_signature_failed' });
  }
});

router.post('/translate', authenticateToken, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const sourceLang = normalizeLang(req.body?.sourceLang || req.body?.source_lang);
  const targets = uniqueTargets(req.body?.targets, sourceLang);

  if (!text) {
    return res.status(400).json({ error: 'text_required' });
  }
  if (!targets.length) {
    return res.json({ sourceLang, translations: [] });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'openai_api_key_missing' });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const targetList = targets
      .map((target) => `- ${target.lang}: ${target.label || LANGUAGE_LABELS[target.lang] || target.lang}`)
      .join('\n');

    const completion = await openai.chat.completions.create({
      model: process.env.MEETING_TRANSLATION_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Tu es un traducteur de reunion en temps reel. Traduis uniquement le sens du message, sans ajouter de commentaire. Reponds en JSON strict: {"translations":{"fr":"...","en":"..."}}.',
        },
        {
          role: 'user',
          content: `Langue source: ${sourceLang}\nLangues cibles:\n${targetList}\n\nMessage:\n${text}`,
        },
      ],
    });

    const parsed = safeParseJson(completion.choices?.[0]?.message?.content);
    const translationsByLang = parsed?.translations || {};
    const translations = targets.map((target) => ({
      lang: target.lang,
      text: String(translationsByLang[target.lang] || '').trim(),
    }));

    return res.json({ sourceLang, translations });
  } catch (err) {
    console.error('[MeetingTranslate] translate failed:', err.response?.data || err.message);
    return res.status(500).json({ error: 'translation_failed' });
  }
});

module.exports = router;
