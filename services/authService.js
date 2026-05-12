const userRepository = require('../repositories/userRepository');
const LoginDTO = require('../dtos/LoginDTO');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class AuthService {
    /**
     * Inscrit un nouvel utilisateur délégué.
     * @param {Object} userData
     */
    async register(userData) {
        const { nom, prenom, email, mot_de_passe } = userData;
        const { v4: uuidv4 } = require('uuid');
        const hash = await bcrypt.hash(mot_de_passe, 10);
        const id = uuidv4();
        await userRepository.create({ id, nom, prenom, email, mot_de_passe: hash });
        return { id, email };
    }

    /**
     * Authentifie un utilisateur via LoginDTO.
     * @param {LoginDTO} dto
     * @returns {Promise<{ token: string, user: Object }>}
     */
    async authenticate(dto) {
        const user = await userRepository.findByEmail(dto.email);
        if (!user) throw new Error('Email ou mot de passe incorrect');

        const valid = await bcrypt.compare(dto.password, user.mot_de_passe);
        if (!valid) throw new Error('Email ou mot de passe incorrect');

        const token = jwt.sign(
            { id: user.id, role: user.role || 'delegue', nom: user.nom },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return {
            token,
            user: { id: user.id, nom: user.nom, role: user.role || 'delegue' }
        };
    }

    /** @deprecated Utiliser authenticate(dto) */
    async login(email, password) {
        return this.authenticate(new LoginDTO(email, password));
    }
}

module.exports = new AuthService();
