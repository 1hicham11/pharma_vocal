const axios = require('axios');
require('dotenv').config();

/**
 * AvatarService - Pont entre Node.js et le microservice Python FastAPI.
 * Gère la communication pour l'animation HeyGen et les traitements IA lourds.
 */
class AvatarService {
    constructor() {
        this.baseUrl = process.env.FASTAPI_URL || 'http://localhost:8001';
    }

    /**
     * Envoie du texte au microservice Python pour préparer l'animation de l'avatar.
     * @param {string} text - Le texte que l'avatar doit prononcer.
     */
    async prepareAvatarSpeech(text) {
        try {
            console.log(`[AvatarService] Envoi du texte à FastAPI : "${text.substring(0, 30)}..."`);
            const response = await axios.post(`${this.baseUrl}/process-avatar`, {
                text: text
            }, {
                timeout: 8000
            });
            return response.data;
        } catch (error) {
            const status = error?.response?.status;
            const payload = error?.response?.data;
            const details = payload ? JSON.stringify(payload) : (error?.message || 'unknown');
            console.error(`[AvatarService] Erreur communication FastAPI${status ? ` (${status})` : ''}: ${details}`);
            // Non-bloquant: la conversation continue même si FastAPI avatar est indisponible.
            return null;
        }
    }

    /**
     * Vérifie si le microservice Python est en ligne.
     */
    async checkHealth() {
        try {
            const response = await axios.get(`${this.baseUrl}/`);
            return response.data;
        } catch (error) {
            return { status: 'offline', error: error.message };
        }
    }
}

module.exports = new AvatarService();
