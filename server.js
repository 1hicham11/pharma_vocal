const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = process.env.PORT || 3000;
/** Quand true : uniquement API + fichiers sous /public (assets, *.html directs). Pas de index.html ni routes SPA à la racine. */
const apiOnly = process.env.API_ONLY === '1' || process.env.API_ONLY === 'true';
const frontendOrigin = (process.env.FRONTEND_ORIGIN || '').replace(/\/$/, '');

const app = express();
app.use(cors());
app.use(express.json());

// Log minimal info for chaque requête (diagnostic)
app.use((req, res, next) => {
  const safeUrl = String(req.url || '').replace(/([?&](?:access_token|token)=)[^&]+/gi, '$1[redacted]');
  console.log(`[HTTP] ${req.method} ${safeUrl}`);
  next();
});

// Route admin directe (AVANT le static pour éviter les interférences)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

/** Anciennes URLs *.html → SPA React (même hôte ou FRONTEND_ORIGIN si API_ONLY) */
function redirectHtmlToSpa(req, res, targetPath) {
    const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    const prefix = apiOnly && frontendOrigin ? frontendOrigin : '';
    res.redirect(302, `${prefix}${targetPath}${q}`);
}
app.get('/login.html', (req, res) => redirectHtmlToSpa(req, res, '/login'));
app.get('/register.html', (req, res) => redirectHtmlToSpa(req, res, '/register'));

// Routes API en premier : ne pas laisser /api/... tomber sur le static ou le catch-all SPA (sinon HTML → erreur JSON.parse côté client)
const authRoutes = require('./routes/auth');
const medicamentsRoutes = require('./routes/medicaments');
const sessionsRoutes = require('./routes/sessions');
const chatRoutes = require('./routes/chat');
const evaluateRoutes = require('./routes/evaluate');
const sttRoutes = require('./routes/stt');
const ttsRoutes = require('./routes/tts');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const agentsRoutes = require('./routes/agents'); // V2 Multi-Agents
const oauthConnectorRoutes = require('./routes/oauth-connectors');
const meetingTranslateRoutes = require('./routes/meeting-translate');
const setupMeetingRealtime = require('./services/meetingRealtimeService');

app.use('/api/auth', authRoutes);
app.use('/api/oauth/connectors', oauthConnectorRoutes);
app.use('/api/medicaments', medicamentsRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/evaluate', evaluateRoutes);
app.use('/api/stt', sttRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/agents', agentsRoutes); // V2 – Multi-Agents (RagFlow + GraphRAG)
app.use('/api/meeting', meetingTranslateRoutes);

// Réponse JSON pour toute route /api non reconnue (évite index.html en 200)
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  if (res.headersSent) return next();
  res.status(404).json({ error: 'Route API introuvable', path: req.originalUrl });
});

// Frontend statique (en API_ONLY : pas de index.html à la racine ni en chemin explicite)
const publicDir = path.join(__dirname, 'public');
if (apiOnly) {
  app.get('/index.html', (req, res) => {
    res.status(404).type('text/plain; charset=utf-8').send(
      `Utilisez le front React (ex. ${frontendOrigin || 'http://localhost:5173'}), pas ce port.`
    );
  });
}
app.use(express.static(publicDir, apiOnly ? { index: false } : {}));

if (apiOnly) {
  app.get(/.*/, (req, res) => {
    res.status(404).type('text/plain; charset=utf-8').send(
      `Pas d'interface React sur ce port (${PORT}). Utilisez le serveur Vite : npm run client:dev → http://localhost:5173 (proxy /api vers ce serveur).`
    );
  });
} else {
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
  if (apiOnly) {
    console.log('[Server] API_ONLY : SPA désactivée ici — front React sur FRONTEND_ORIGIN (ex. http://localhost:5173).');
  }
  console.log('[Server] Event loop kept alive...');
});

setupMeetingRealtime(server);

// Diagnostic Keep-alive
setInterval(() => {
  // console.log('[Server] Heartbeat...');
}, 60000);

process.on('exit', (code) => {
  console.log(`🛑 Processus sort avec le code: ${code}`);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT reçu. Fermeture du serveur...');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM reçu. Fermeture du serveur...');
  server.close(() => process.exit(0));
});

// Gestion des erreurs fatales pour éviter le Exit Code 1 silencieux
process.on('uncaughtException', (err) => {
  console.error('💥 ERREUR CRITIQUE (uncaughtException):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 REJET NON GÉRÉ (unhandledRejection):', reason);
});