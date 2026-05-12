class StartSessionDTO {
    /**
     * @param {string} delegueId
     * @param {string|null} persona
     * @param {number|null} medicamentId
     */
    constructor(delegueId, persona = null, medicamentId = null) {
        this.delegueId = delegueId;
        this.persona = persona;
        this.medicamentId = medicamentId;
    }

    static fromRequest(userId, body) {
        return new StartSessionDTO(userId, body.persona || null, body.medicament_id || null);
    }
}

module.exports = StartSessionDTO;
