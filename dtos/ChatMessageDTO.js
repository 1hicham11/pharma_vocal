/**
 * DTO – Chat Message
 * Regroupe les données d'un message entrant dans la session de chat.
 */
class ChatMessageDTO {
    /**
     * @param {string} sessionId
     * @param {string|null} message  (texte déjà transcrit ou saisi)
     * @param {object|null} audioFile (objet multer si upload audio direct)
     */
    constructor(sessionId, message = null, audioFile = null, persona = null) {
        this.sessionId = sessionId;
        this.message = message;
        this.audioFile = audioFile;
        this.persona = persona;
    }

    static fromRequest(body, file = null) {
        const safeBody = body || {};
        return new ChatMessageDTO(
            safeBody.session_id || null,
            safeBody.message || null,
            file || null,
            safeBody.persona || null
        );
    }
}

module.exports = ChatMessageDTO;
