const pool = require('../db/connection');

class DashboardService {
    async getDashboardStats({ userId, role, scope } = {}) {
        try {
            const isAdmin = role === 'admin';
            const useGlobalScope = isAdmin && scope === 'global';
            const scopedUserId = !useGlobalScope && userId ? userId : null;

            const [sessionsCount] = scopedUserId
                ? await pool.query(`
                    SELECT COUNT(*) as total
                    FROM SESSIONS_ASSISTANCE s
                    WHERE s.user_id = ?
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                `, [scopedUserId])
                : await pool.query(`
                    SELECT COUNT(*) as total
                    FROM SESSIONS_ASSISTANCE s
                    WHERE EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                `);

            const [successCount] = scopedUserId
                ? await pool.query(`
                    SELECT COUNT(*) as count
                    FROM SYNTHESE_ASSISTANCE sy
                    JOIN SESSIONS_ASSISTANCE s ON s.id = sy.session_id
                    WHERE sy.succes_aide = 1 AND s.user_id = ?
                `, [scopedUserId])
                : await pool.query('SELECT COUNT(*) as count FROM SYNTHESE_ASSISTANCE WHERE succes_aide = 1');

            const [totalSyntheseRows] = scopedUserId
                ? await pool.query(`
                    SELECT COUNT(*) as total
                    FROM SYNTHESE_ASSISTANCE sy
                    JOIN SESSIONS_ASSISTANCE s ON s.id = sy.session_id
                    WHERE s.user_id = ?
                `, [scopedUserId])
                : await pool.query('SELECT COUNT(*) as total FROM SYNTHESE_ASSISTANCE');

            const totalSynthese = totalSyntheseRows[0].total;
            const successRate = totalSynthese > 0
                ? ((successCount[0].count / totalSynthese) * 100).toFixed(2)
                : 0;

            const activeDeleguatesCount = scopedUserId
                ? 1
                : (await pool.query('SELECT COUNT(*) as count FROM UTILISATEURS'))[0][0].count;

            const [topAvatars] = scopedUserId
                ? await pool.query(`
                    SELECT a.nom_avatar, COUNT(s.id) as session_count
                    FROM AVATARS_ASSISTANTS a
                    LEFT JOIN SESSIONS_ASSISTANCE s ON s.avatar_id = a.id AND s.user_id = ?
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                    WHERE a.user_id = ?
                    GROUP BY a.id, a.nom_avatar
                    ORDER BY session_count DESC, a.nom_avatar ASC
                    LIMIT 5
                `, [scopedUserId, scopedUserId])
                : await pool.query(`
                    SELECT a.nom_avatar, COUNT(s.id) as session_count
                    FROM SESSIONS_ASSISTANCE s
                    JOIN AVATARS_ASSISTANTS a ON s.avatar_id = a.id
                    WHERE EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                    GROUP BY s.avatar_id, a.nom_avatar
                    ORDER BY session_count DESC
                    LIMIT 5
                `);
            const [topAvatarsLast7Days] = scopedUserId
                ? await pool.query(`
                    SELECT COALESCE(a.nom_avatar, 'Expert supprime') as nom_avatar, COUNT(s.id) as session_count
                    FROM SESSIONS_ASSISTANCE s
                    LEFT JOIN AVATARS_ASSISTANTS a ON a.id = s.avatar_id
                    WHERE s.user_id = ?
                      AND DATE(s.date_debut) BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                    GROUP BY s.avatar_id, a.nom_avatar
                    ORDER BY session_count DESC, nom_avatar ASC
                `, [scopedUserId])
                : await pool.query(`
                    SELECT COALESCE(a.nom_avatar, 'Expert supprime') as nom_avatar, COUNT(s.id) as session_count
                    FROM SESSIONS_ASSISTANCE s
                    LEFT JOIN AVATARS_ASSISTANTS a ON a.id = s.avatar_id
                    WHERE DATE(s.date_debut) BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                    GROUP BY s.avatar_id, a.nom_avatar
                    ORDER BY session_count DESC, nom_avatar ASC
                `);

            const [recentSessions] = scopedUserId
                ? await pool.query(`
                    SELECT s.id, s.date_debut, s.statut,
                           u.nom AS delegue_nom,
                           u.prenom AS delegue_prenom,
                           a.nom_avatar AS medicament_nom,
                           CASE WHEN sy.succes_aide = 1 THEN 100 ELSE 0 END AS score_global
                    FROM SESSIONS_ASSISTANCE s
                    JOIN UTILISATEURS u ON s.user_id = u.id
                    LEFT JOIN AVATARS_ASSISTANTS a ON s.avatar_id = a.id
                    LEFT JOIN SYNTHESE_ASSISTANCE sy ON sy.session_id = s.id
                    WHERE s.user_id = ?
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                    ORDER BY s.date_debut DESC
                    LIMIT 10
                `, [scopedUserId])
                : await pool.query(`
                    SELECT s.id, s.date_debut, s.statut,
                           u.nom AS delegue_nom,
                           u.prenom AS delegue_prenom,
                           a.nom_avatar AS medicament_nom,
                           CASE WHEN sy.succes_aide = 1 THEN 100 ELSE 0 END AS score_global
                    FROM SESSIONS_ASSISTANCE s
                    JOIN UTILISATEURS u ON s.user_id = u.id
                    LEFT JOIN AVATARS_ASSISTANTS a ON s.avatar_id = a.id
                    LEFT JOIN SYNTHESE_ASSISTANCE sy ON sy.session_id = s.id
                    WHERE EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                    ORDER BY s.date_debut DESC
                    LIMIT 10
                `);

            const [sessionsByDay] = scopedUserId
                ? await pool.query(`
                    SELECT DATE_FORMAT(date_debut, '%d %b') as day, COUNT(*) as count
                    FROM SESSIONS_ASSISTANCE
                    WHERE user_id = ?
                      AND DATE(date_debut) BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = SESSIONS_ASSISTANCE.id)
                    GROUP BY DATE(date_debut)
                    ORDER BY DATE(date_debut) ASC
                `, [scopedUserId])
                : await pool.query(`
                    SELECT DATE_FORMAT(date_debut, '%d %b') as day, COUNT(*) as count
                    FROM SESSIONS_ASSISTANCE
                    WHERE DATE(date_debut) BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = SESSIONS_ASSISTANCE.id)
                    GROUP BY DATE(date_debut)
                    ORDER BY DATE(date_debut) ASC
                `);
            const [sessionsByDayByAgent] = scopedUserId
                ? await pool.query(`
                    SELECT
                        DATE_FORMAT(s.date_debut, '%d %b') as day,
                        COALESCE(a.nom_avatar, 'Expert supprime') as agent_name,
                        COUNT(*) as count
                    FROM SESSIONS_ASSISTANCE s
                    LEFT JOIN AVATARS_ASSISTANTS a ON a.id = s.avatar_id
                    WHERE s.user_id = ?
                      AND DATE(s.date_debut) BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                    GROUP BY DATE(s.date_debut), s.avatar_id, agent_name
                    ORDER BY DATE(s.date_debut) ASC, count DESC, agent_name ASC
                `, [scopedUserId])
                : await pool.query(`
                    SELECT
                        DATE_FORMAT(s.date_debut, '%d %b') as day,
                        COALESCE(a.nom_avatar, 'Expert supprime') as agent_name,
                        COUNT(*) as count
                    FROM SESSIONS_ASSISTANCE s
                    LEFT JOIN AVATARS_ASSISTANTS a ON a.id = s.avatar_id
                    WHERE DATE(s.date_debut) BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                    GROUP BY DATE(s.date_debut), s.avatar_id, agent_name
                    ORDER BY DATE(s.date_debut) ASC, count DESC, agent_name ASC
                `);
            const [sessionsLast7Rows] = scopedUserId
                ? await pool.query(`
                    SELECT COUNT(*) as total
                    FROM SESSIONS_ASSISTANCE
                    WHERE user_id = ?
                      AND DATE(date_debut) BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = SESSIONS_ASSISTANCE.id)
                `, [scopedUserId])
                : await pool.query(`
                    SELECT COUNT(*) as total
                    FROM SESSIONS_ASSISTANCE
                    WHERE DATE(date_debut) BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = SESSIONS_ASSISTANCE.id)
                `);

            const [ragDocsCount] = await pool.query('SELECT COUNT(*) as total FROM RAG_DOCUMENTS');
            const [ragChunksCount] = await pool.query('SELECT SUM(chunk_count) as total FROM RAG_DOCUMENTS');

            const [avatarSuccess] = scopedUserId
                ? await pool.query(`
                    SELECT a.nom_avatar,
                           COUNT(s.id) as total,
                           SUM(CASE WHEN sy.succes_aide = 1 THEN 1 ELSE 0 END) as success_count
                    FROM AVATARS_ASSISTANTS a
                    LEFT JOIN SESSIONS_ASSISTANCE s ON s.avatar_id = a.id AND s.user_id = ?
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                    LEFT JOIN SYNTHESE_ASSISTANCE sy ON sy.session_id = s.id
                    WHERE a.user_id = ?
                    GROUP BY a.id, a.nom_avatar
                    ORDER BY total DESC, a.nom_avatar ASC
                    LIMIT 5
                `, [scopedUserId, scopedUserId])
                : await pool.query(`
                    SELECT a.nom_avatar,
                           COUNT(s.id) as total,
                           SUM(CASE WHEN sy.succes_aide = 1 THEN 1 ELSE 0 END) as success_count
                    FROM AVATARS_ASSISTANTS a
                    LEFT JOIN SESSIONS_ASSISTANCE s ON s.avatar_id = a.id
                      AND EXISTS (SELECT 1 FROM MESSAGES m WHERE m.session_id = s.id)
                    LEFT JOIN SYNTHESE_ASSISTANCE sy ON sy.session_id = s.id
                    GROUP BY a.id, a.nom_avatar
                    ORDER BY total DESC
                    LIMIT 5
                `);

            return {
                totalSessions: sessionsCount[0].total,
                sessionsLast7Days: sessionsLast7Rows[0].total || 0,
                averageScore: successRate + '%',
                activeDeleguates: activeDeleguatesCount,
                topMedications: topAvatars.map(a => ({ nom_commercial: a.nom_avatar, discussion_count: a.session_count })),
                topMedicationsLast7Days: topAvatarsLast7Days.map(a => ({ nom_commercial: a.nom_avatar, discussion_count: a.session_count })),
                recentSessions: recentSessions,
                sessionsByDay: sessionsByDay,
                sessionsByDayByAgent: sessionsByDayByAgent.map(r => ({
                    day: r.day,
                    agentName: r.agent_name,
                    count: Number(r.count) || 0
                })),
                ragStats: {
                    totalDocuments: ragDocsCount[0].total,
                    totalChunks: ragChunksCount[0].total || 0
                },
                avatarSuccessRate: avatarSuccess.map(a => ({
                    name: a.nom_avatar,
                    successRate: a.total > 0 ? Math.round((a.success_count / a.total) * 100) : 0,
                    total: a.total
                }))
            };
        } catch (err) {
            console.error('DashboardService.getDashboardStats:', err.message);
            throw err;
        }
    }
}

module.exports = new DashboardService();
