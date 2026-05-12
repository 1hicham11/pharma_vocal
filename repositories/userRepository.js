const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

class UserRepository extends BaseRepository {
    constructor() {
        super(pool, 'utilisateurs');
    }

    /**
     * Insère un nouvel utilisateur (délégué).
     * @param {Object} userData
     * @returns {Promise<Object>}
     */
    async create(userData) {
        const { id, nom, prenom, email, mot_de_passe, role } = userData;
        const [result] = await this.pool.query(
            `INSERT INTO utilisateurs (id, nom, prenom, email, mot_de_passe, role, date_inscription) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [id, nom, prenom || '', email, mot_de_passe, role || 'delegue']
        );
        return result;
    }

    /**
     * Recherche un utilisateur actif par email.
     * @param {string} email
     * @returns {Promise<Object|undefined>}
     */
    async findByEmail(email) {
        const [rows] = await this.pool.query(
            'SELECT * FROM utilisateurs WHERE email = ?',
            [email]
        );
        return rows[0];
    }
}

module.exports = new UserRepository();
