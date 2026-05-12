const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query?.access_token || req.query?.token;

    if (!token) {
        console.warn('[Auth] Token manquant');
        return res.status(401).json({ error: 'Token manquant' });
    }

    // Mode démo : token spécial généré côté frontend (login local)
    if (token === 'dev-token') {
        req.user = {
            id: 'demo-user',
            role: 'admin',
            nom: 'Demo'
        };
        return next();
    }

    if (!process.env.JWT_SECRET) {
        console.error('[Auth] CRITICAL: JWT_SECRET non défini dans env');
        return res.status(500).json({ error: 'Erreur configuration serveur' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('[Auth] Erreur verification:', err.message, '| Secret length:', process.env.JWT_SECRET?.length);
        return res.status(403).json({ error: 'Token invalide' });
    }
}

module.exports = authenticateToken;
