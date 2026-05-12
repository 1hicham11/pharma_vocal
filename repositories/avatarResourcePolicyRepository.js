const pool = require('../db/connection');

const DEFAULT_POLICY = Object.freeze({
    use_rag: true,
    use_db: true,
    use_general_knowledge: true,
    ranking_mode: 'auto',
    ranking: ['rag', 'db', 'general'],
});

class AvatarResourcePolicyRepository {
    constructor() {
        this._tableReady = false;
    }

    getDefaultPolicy() {
        return {
            use_rag: DEFAULT_POLICY.use_rag,
            use_db: DEFAULT_POLICY.use_db,
            use_general_knowledge: DEFAULT_POLICY.use_general_knowledge,
            ranking_mode: DEFAULT_POLICY.ranking_mode,
            ranking: [...DEFAULT_POLICY.ranking],
        };
    }

    async ensureTable() {
        if (this._tableReady) return;
        await pool.query(`
            CREATE TABLE IF NOT EXISTS avatar_resource_policies (
                avatar_id INT PRIMARY KEY,
                use_rag TINYINT(1) NOT NULL DEFAULT 1,
                use_db TINYINT(1) NOT NULL DEFAULT 1,
                use_general_knowledge TINYINT(1) NOT NULL DEFAULT 1,
                ranking_mode ENUM('auto', 'manual') NOT NULL DEFAULT 'auto',
                ranking_json TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        this._tableReady = true;
    }

    _toBool(value, fallback) {
        if (value === undefined || value === null) return fallback;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value > 0;
        const s = String(value).trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(s)) return true;
        if (['0', 'false', 'no', 'off'].includes(s)) return false;
        return fallback;
    }

    _normalizeRanking(ranking) {
        const allowed = ['rag', 'db', 'general'];
        const deduped = [];
        for (const raw of Array.isArray(ranking) ? ranking : []) {
            const key = String(raw || '').trim().toLowerCase();
            if (allowed.includes(key) && !deduped.includes(key)) {
                deduped.push(key);
            }
        }
        for (const key of allowed) {
            if (!deduped.includes(key)) deduped.push(key);
        }
        return deduped;
    }

    _normalizePolicy(input = {}) {
        const defaults = this.getDefaultPolicy();
        const rankingMode = String(input.ranking_mode || '').toLowerCase() === 'manual' ? 'manual' : 'auto';
        return {
            use_rag: this._toBool(input.use_rag, defaults.use_rag),
            use_db: this._toBool(input.use_db, defaults.use_db),
            use_general_knowledge: this._toBool(input.use_general_knowledge, defaults.use_general_knowledge),
            ranking_mode: rankingMode,
            ranking: this._normalizeRanking(input.ranking),
        };
    }

    _rowToPolicy(row) {
        if (!row) return this.getDefaultPolicy();
        let parsedRanking = [];
        try {
            parsedRanking = JSON.parse(row.ranking_json || '[]');
        } catch (_) {
            parsedRanking = [];
        }
        return this._normalizePolicy({
            use_rag: row.use_rag,
            use_db: row.use_db,
            use_general_knowledge: row.use_general_knowledge,
            ranking_mode: row.ranking_mode,
            ranking: parsedRanking,
        });
    }

    async getByAvatarId(avatarId) {
        await this.ensureTable();
        const [rows] = await pool.query(
            'SELECT * FROM avatar_resource_policies WHERE avatar_id = ? LIMIT 1',
            [avatarId]
        );
        return this._rowToPolicy(rows[0]);
    }

    async getManyByAvatarIds(avatarIds = []) {
        await this.ensureTable();
        const uniqueIds = [...new Set((avatarIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
        if (!uniqueIds.length) return {};

        const placeholders = uniqueIds.map(() => '?').join(', ');
        const [rows] = await pool.query(
            `SELECT * FROM avatar_resource_policies WHERE avatar_id IN (${placeholders})`,
            uniqueIds
        );

        const byId = {};
        for (const id of uniqueIds) {
            byId[id] = this.getDefaultPolicy();
        }
        for (const row of rows) {
            byId[row.avatar_id] = this._rowToPolicy(row);
        }
        return byId;
    }

    async upsertByAvatarId(avatarId, policyInput = {}) {
        await this.ensureTable();
        const policy = this._normalizePolicy(policyInput);

        await pool.query(
            `
                INSERT INTO avatar_resource_policies
                    (avatar_id, use_rag, use_db, use_general_knowledge, ranking_mode, ranking_json)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    use_rag = VALUES(use_rag),
                    use_db = VALUES(use_db),
                    use_general_knowledge = VALUES(use_general_knowledge),
                    ranking_mode = VALUES(ranking_mode),
                    ranking_json = VALUES(ranking_json)
            `,
            [
                avatarId,
                policy.use_rag ? 1 : 0,
                policy.use_db ? 1 : 0,
                policy.use_general_knowledge ? 1 : 0,
                policy.ranking_mode,
                JSON.stringify(policy.ranking),
            ]
        );

        return policy;
    }
}

module.exports = new AvatarResourcePolicyRepository();
