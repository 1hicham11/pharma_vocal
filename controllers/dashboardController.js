const dashboardService = require('../services/dashboardService');

class DashboardController {
    async getStats(req, res) {
        try {
            const wantsGlobalScope = ['1', 'true', 'yes'].includes(String(req.query?.scope || '').toLowerCase());
            const useGlobalScope = wantsGlobalScope && req.user?.role === 'admin';
            const stats = await dashboardService.getDashboardStats({
                userId: req.user?.id,
                role: req.user?.role,
                scope: useGlobalScope ? 'global' : 'user'
            });
            res.json(stats);
        } catch (err) {
            res.status(500).json({ error: 'Erreur stats' });
        }
    }
}

module.exports = new DashboardController();
