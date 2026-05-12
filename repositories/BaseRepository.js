/**
 * BaseRepository – Classe abstraite
 * Tous les repositories doivent étendre cette classe
 * et implémenter create() et findById().
 */
class BaseRepository {
    constructor(pool, tableName) {
        this.pool = pool;
        this.tableName = tableName;
    }

    /**
     * Insère un enregistrement dans la table.
     * @param {Object} data
     * @returns {Promise<any>}
     */
    async create(data) {
        throw new Error(`${this.constructor.name} doit implémenter create()`);
    }

    /**
     * Recherche un enregistrement par son id.
     * @param {any} id
     * @returns {Promise<Object|undefined>}
     */
    async findById(id) {
        try {
            const [rows] = await this.pool.query(
                `SELECT * FROM \`${this.tableName}\` WHERE id = ?`,
                [id]
            );
            return rows[0];
        } catch (err) {
            // Certains modules sont optionnels selon le schéma importé
            if (
                err &&
                (err.code === 'ER_NO_SUCH_TABLE' ||
                    (typeof err.message === 'string' && err.message.includes("doesn't exist")))
            ) {
                return undefined;
            }
            throw err;
        }
    }
}

module.exports = BaseRepository;
