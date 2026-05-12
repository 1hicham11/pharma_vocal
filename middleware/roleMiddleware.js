function isAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        console.warn(`[Admin] Accès refusé pour l'utilisateur ${req.user?.nom || 'Inconnu'} (Rôle: ${req.user?.role})`);
        return res.status(403).json({ error: 'Accès administrateur requis' });
    }
    next();
}

module.exports = isAdmin;
