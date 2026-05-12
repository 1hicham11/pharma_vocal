const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

class SessionRepository extends BaseRepository {
    constructor() {
        super(pool, 'SESSIONS_ASSISTANCE');
    }

    /**
     * RECUPERATION SESSION + EXPERT
     */
    async findById(id) {
        const [rows] = await this.pool.query(`
            SELECT s.*, a.prompt_systeme, a.nom_avatar, a.icone, a.use_rag, a.use_knowledge, a.use_db, a.image_url, a.vocal_id
            FROM SESSIONS_ASSISTANCE s
            JOIN AVATARS_ASSISTANTS a ON s.avatar_id = a.id
            WHERE s.id = ?
        `, [id]);
        return rows[0];
    }

    /**
     * RECHERCHE OU CREATION GENERIQUE (Pour eviter le crash au lancement)
     */
    async getOrCreateAvatarByPersona(personaName) {
        const [rows] = await this.pool.query(
            'SELECT id FROM AVATARS_ASSISTANTS WHERE nom_avatar = ? LIMIT 1',
            [personaName]
        );

        if (rows && rows.length > 0) return rows[0].id;

        // Si l'agent n'existe pas (ex: premier lancement), on le cree avec un prompt neutre
        const [result] = await this.pool.execute(
            'INSERT INTO AVATARS_ASSISTANTS (nom_avatar, prompt_systeme, created_at) VALUES (?, ?, NOW())',
            [personaName, 'Vous etes un assistant virtuel professionnel.']
        );
        return result.insertId;
    }

    async getAllAvatars(userId) {
        const [rows] = await this.pool.query(`
            SELECT a.*, r.rag as use_rag_alt, r.db as use_db_alt, r.knowledge as use_knowledge_alt
            FROM AVATARS_ASSISTANTS a
            LEFT JOIN avatar_resources r ON a.id = r.avatar_id
            WHERE a.user_id = ?
            ORDER BY a.created_at DESC
        `, [userId]);
        return rows;
    }

    async getAvatarById(id, userId) {
        const [rows] = await this.pool.query(
            'SELECT * FROM AVATARS_ASSISTANTS WHERE id = ? AND user_id = ? LIMIT 1',
            [id, userId]
        );
        return rows[0] || null;
    }

    async createAvatar(data, userId) {
        const { nom_avatar, prompt_systeme, icone, use_rag, use_db, use_knowledge, vocal_id } = data;
        const [result] = await this.pool.execute(
            'INSERT INTO AVATARS_ASSISTANTS (nom_avatar, prompt_systeme, icone, use_rag, use_db, use_knowledge, vocal_id, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [nom_avatar, prompt_systeme, icone || '🤖', use_rag ?? 1, use_db ?? 1, use_knowledge ?? 1, String(vocal_id || '').trim() || null, userId]
        );
        return result.insertId;
    }

    async deleteAvatar(id, userId) {
        await this.pool.execute('DELETE FROM AVATARS_ASSISTANTS WHERE id = ? AND user_id = ?', [id, userId]);
    }

    async updateAvatar(id, data, userId) {
        const { nom_avatar, prompt_systeme, icone, use_rag, use_db, use_knowledge, vocal_id } = data;
        await this.pool.execute(
            'UPDATE AVATARS_ASSISTANTS SET nom_avatar = ?, prompt_systeme = ?, icone = ?, use_rag = ?, use_db = ?, use_knowledge = ?, vocal_id = ? WHERE id = ? AND user_id = ?',
            [nom_avatar, prompt_systeme, icone || '🤖', use_rag, use_db, use_knowledge, String(vocal_id || '').trim() || null, id, userId]
        );
    }

    async updateAvatarImageUrl(id, userId, imageUrl) {
        await this.pool.execute(
            'UPDATE AVATARS_ASSISTANTS SET image_url = ? WHERE id = ? AND user_id = ?',
            [imageUrl, id, userId]
        );
    }

    async create(data) {
        const { id, user_id, avatar_id } = data;
        await this.pool.execute(
            `INSERT INTO SESSIONS_ASSISTANCE (id, user_id, avatar_id, statut, date_debut)
             VALUES (?, ?, ?, 'active', NOW())`,
            [id, user_id, avatar_id]
        );
    }

    async findByDelegueId(userId, personaName = null, avatarId = null) {
        let query = `
            SELECT 
                s.id, 
                s.date_debut, 
                s.statut, 
                a.nom_avatar as medicament_nom, 
                COUNT(m.id) as nb_messages,
                (
                    SELECT m1.transcription_texte
                    FROM MESSAGES m1
                    WHERE m1.session_id = s.id
                      AND m1.auteur = 'utilisateur'
                    ORDER BY m1.date_envoi ASC, m1.id ASC
                    LIMIT 1
                ) as session_title
            FROM SESSIONS_ASSISTANCE s
            JOIN AVATARS_ASSISTANTS a ON s.avatar_id = a.id
            LEFT JOIN MESSAGES m ON m.session_id = s.id
            WHERE s.user_id = ?
        `;
        const params = [userId];
        const aid = avatarId != null ? Number(avatarId) : NaN;
        if (Number.isFinite(aid)) {
            query += ' AND s.avatar_id = ? ';
            params.push(aid);
        } else if (personaName) {
            query += ' AND a.nom_avatar = ? ';
            params.push(personaName);
        }
        query += ' GROUP BY s.id ORDER BY s.date_debut DESC';
        const [rows] = await this.pool.execute(query, params);
        return rows;
    }

    async finalize(id) {
        await this.pool.query("UPDATE SESSIONS_ASSISTANCE SET statut = 'terminee' WHERE id = ?", [id]);
    }
}

module.exports = new SessionRepository();
