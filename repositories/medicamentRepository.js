const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

class MedicamentRepository extends BaseRepository {
    constructor() {
        super(pool, 'medicaments');
    }

    /**
     * Insère un nouveau médicament.
     * @param {Object} data
     * @returns {Promise<number>}  insertId
     */
    async create(data) {
        const {
            nom_commercial, dci, classe_therapeutique, indication,
            posologie, effets_indesirables, contre_indications, questions_type, actif
        } = data;
        const [result] = await this.pool.query(
            `INSERT INTO medicaments (nom_commercial, dci, classe_therapeutique, indication, posologie, effets_indesirables, contre_indications, questions_type, actif) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nom_commercial, dci, classe_therapeutique, indication, posologie,
                effets_indesirables, contre_indications, questions_type, actif || 1]
        );
        return result.insertId;
    }

    async getAllActive() {
        try {
            const [rows] = await this.pool.query(
                'SELECT * FROM medicaments WHERE actif = 1'
            );
            return rows;
        } catch (err) {
            // Permet au frontend de fonctionner même si la table n'a pas été importée
            if (
                err &&
                (err.code === 'ER_NO_SUCH_TABLE' ||
                    (typeof err.message === 'string' && err.message.includes("doesn't exist")))
            ) {
                return [];
            }
            throw err;
        }
    }

    async getAll() {
        try {
            const [rows] = await this.pool.query('SELECT * FROM medicaments');
            return rows;
        } catch (err) {
            if (
                err &&
                (err.code === 'ER_NO_SUCH_TABLE' ||
                    (typeof err.message === 'string' && err.message.includes("doesn't exist")))
            ) {
                return [];
            }
            throw err;
        }
    }

    async update(id, data) {
        const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
        const values = Object.values(data);
        await this.pool.query(`UPDATE medicaments SET ${fields} WHERE id = ?`, [...values, id]);
    }

    async delete(id) {
        await this.pool.query('DELETE FROM medicaments WHERE id = ?', [id]);
    }

    async getUnknownMeds() {
        const [rows] = await this.pool.query(
            'SELECT * FROM medicaments_inconnus ORDER BY detecte_le DESC'
        );
        return rows;
    }

    async deleteUnknownMed(id) {
        await this.pool.query('DELETE FROM medicaments_inconnus WHERE id = ?', [id]);
    }
}

module.exports = new MedicamentRepository();
