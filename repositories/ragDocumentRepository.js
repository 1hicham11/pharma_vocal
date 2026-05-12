const BaseRepository = require('./BaseRepository');
const pool = require('../db/connection');

class RagDocumentRepository extends BaseRepository {
    constructor() {
        super(pool, 'RAG_DOCUMENTS');
        this.schemaEnsured = false;
    }

    async ensureSchema() {
        if (this.schemaEnsured) return;
        try {
            await this.pool.query(`ALTER TABLE RAG_DOCUMENTS ADD COLUMN avatar_id INT NULL`);
        } catch (err) {
            if (err && err.code !== 'ER_DUP_FIELDNAME') throw err;
        }
        this.schemaEnsured = true;
    }

    async create({ uuid, filename, status, chunk_count, avatar_id = null }) {
        await this.ensureSchema();
        const [result] = await this.pool.execute(
            `INSERT INTO RAG_DOCUMENTS (uuid, filename, status, chunk_count, avatar_id) VALUES (?, ?, ?, ?, ?)`,
            [uuid, filename, status, chunk_count, avatar_id]
        );
        return result.insertId;
    }

    async findAll() {
        await this.ensureSchema();
        const [rows] = await this.pool.query(`
            SELECT r.*, a.nom_avatar
            FROM RAG_DOCUMENTS r
            LEFT JOIN AVATARS_ASSISTANTS a ON a.id = r.avatar_id
            ORDER BY r.created_at DESC
        `);
        return rows;
    }

    async deleteByUuid(uuid) {
        await this.pool.execute(`DELETE FROM RAG_DOCUMENTS WHERE uuid = ?`, [uuid]);
    }

    async findByUuid(uuid) {
        const [rows] = await this.pool.query(
            'SELECT * FROM RAG_DOCUMENTS WHERE uuid = ?',
            [uuid]
        );
        return rows[0] || null;
    }
}

module.exports = new RagDocumentRepository();
