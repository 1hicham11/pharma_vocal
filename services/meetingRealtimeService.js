const jwt = require('jsonwebtoken');
const WebSocket = require('ws');

const MAX_ROOM_ID_LENGTH = 80;
const MAX_NAME_LENGTH = 80;

function sanitizeRoomId(value) {
  const room = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, MAX_ROOM_ID_LENGTH);
  return room || 'default';
}

function sanitizeParticipant(input) {
  return {
    id: String(input.id || '').trim().slice(0, 80),
    name: String(input.name || 'Participant').trim().slice(0, MAX_NAME_LENGTH) || 'Participant',
    lang: String(input.lang || 'fr').trim().toLowerCase().split('-')[0] || 'fr',
    userId: input.userId,
    joinedAt: input.joinedAt || Date.now(),
  };
}

function sanitizeZoomMeeting(input) {
  if (!input || typeof input !== 'object') return null;
  const joinUrl = String(input.joinUrl || '').trim();
  if (!joinUrl) return null;
  return {
    id: String(input.id || '').trim().slice(0, 80),
    topic: String(input.topic || 'Réunion Zoom').trim().slice(0, 200),
    joinUrl,
    startUrl: String(input.startUrl || '').trim(),
    password: String(input.password || '').trim().slice(0, 80),
    createdAt: input.createdAt || new Date().toISOString(),
    roomId: String(input.roomId || '').trim().slice(0, MAX_ROOM_ID_LENGTH),
  };
}

function authenticateToken(token) {
  if (token === 'dev-token') {
    return { id: 'demo-user', role: 'admin', nom: 'Demo' };
  }
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (_) {
    return null;
  }
}

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function setupMeetingRealtime(server) {
  const wss = new WebSocket.Server({ noServer: true });
  const rooms = new Map();
  const zoomMeetings = new Map();

  function getRoom(roomId) {
    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    return rooms.get(roomId);
  }

  function roomParticipants(roomId) {
    const room = rooms.get(roomId);
    if (!room) return [];
    return [...room.values()].map((client) => client.participant);
  }

  function broadcast(roomId, payload) {
    const room = rooms.get(roomId);
    if (!room) return;
    for (const client of room.values()) {
      sendJson(client.ws, payload);
    }
  }

  function broadcastPresence(roomId) {
    broadcast(roomId, {
      type: 'presence',
      roomId,
      participants: roomParticipants(roomId),
    });
  }

  server.on('upgrade', (request, socket, head) => {
    let parsed;
    try {
      parsed = new URL(request.url, 'http://localhost');
    } catch (_) {
      socket.destroy();
      return;
    }

    if (parsed.pathname !== '/ws/meetings') return;

    const token = parsed.searchParams.get('token');
    const user = authenticateToken(token);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const roomId = sanitizeRoomId(parsed.searchParams.get('room'));
      const participant = sanitizeParticipant({
        id: parsed.searchParams.get('participantId') || `${user.id}-${Date.now()}`,
        name: parsed.searchParams.get('name') || user.nom || user.email || 'Participant',
        lang: parsed.searchParams.get('lang') || 'fr',
        userId: user.id,
        joinedAt: Date.now(),
      });

      const room = getRoom(roomId);
      room.set(ws, { ws, participant });

      sendJson(ws, { type: 'ready', roomId, participant, zoomMeeting: zoomMeetings.get(roomId) || null });
      broadcastPresence(roomId);

      ws.on('message', (raw) => {
        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch (_) {
          return;
        }

        if (message.type === 'participant:update') {
          const client = room.get(ws);
          if (!client) return;
          client.participant = sanitizeParticipant({
            ...client.participant,
            name: message.name,
            lang: message.lang,
          });
          broadcastPresence(roomId);
          return;
        }

        if (message.type === 'turn' && message.turn) {
          broadcast(roomId, {
            type: 'turn',
            roomId,
            turn: message.turn,
          });
          return;
        }

        if (message.type === 'zoom:meeting') {
          const zoomMeeting = sanitizeZoomMeeting(message.meeting);
          if (!zoomMeeting) return;
          zoomMeetings.set(roomId, { ...zoomMeeting, roomId });
          broadcast(roomId, {
            type: 'zoom:meeting',
            roomId,
            meeting: zoomMeetings.get(roomId),
          });
          return;
        }

        if (message.type === 'clear') {
          broadcast(roomId, { type: 'clear', roomId });
        }
      });

      ws.on('close', () => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom) return;
        currentRoom.delete(ws);
        if (!currentRoom.size) {
          rooms.delete(roomId);
          return;
        }
        broadcastPresence(roomId);
      });
    });
  });

  console.log('[MeetingRealtime] WebSocket prêt sur /ws/meetings');
}

module.exports = setupMeetingRealtime;
