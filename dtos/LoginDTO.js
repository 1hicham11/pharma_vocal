/**
 * DTO – Login
 * Regroupe les données nécessaires à l'authentification.
 */
class LoginDTO {
    /**
     * @param {string} email
     * @param {string} password  (mot_de_passe en clair avant hachage)
     */
    constructor(email, password) {
        this.email = email;
        this.password = password;
    }

    static fromRequest(body) {
        return new LoginDTO(body.email, body.mot_de_passe || body.password);
    }
}

module.exports = LoginDTO;
