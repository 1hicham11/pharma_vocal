const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

/**
 * AvatarRepository – Accès générique à la table AVATARS_ASSISTANTS
 * Gère n'importe quel type d'agent (Médical, Technique, RH, etc.)
 */
class AvatarRepository extends BaseRepository {
    constructor() {
        super(pool, 'AVATARS_ASSISTANTS');
    }

    /**
     * Récupère la configuration complète d'un expert par son ID
     * @param {number} avatarId 
     */
    async findById(avatarId) {
        const [rows] = await this.pool.query(
            `SELECT * FROM AVATARS_ASSISTANTS WHERE id = ?`,
            [avatarId]
        );
        return rows[0] || null;
    }

    /**
     * Liste tous les experts configurés dans le système
     */
    async findAll() {
        const [rows] = await this.pool.query(
            `SELECT id, nom_avatar, icone, use_rag, use_knowledge, image_url 
             FROM AVATARS_ASSISTANTS 
             ORDER BY nom_avatar ASC`
        );
        return rows;
    }
}

module.exports = new AvatarRepository();