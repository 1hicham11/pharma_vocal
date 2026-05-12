const authService = require('../services/authService');
const LoginDTO = require('../dtos/LoginDTO');

class AuthController {
    async register(req, res) {
        try {
            await authService.register(req.body);
            res.status(201).json({ message: 'Compte créé avec succès' });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Email déjà utilisé' });
            }
            res.status(500).json({ error: err.message });
        }
    }

    async login(req, res) {
        try {
            const dto = LoginDTO.fromRequest(req.body);
            const result = await authService.authenticate(dto);
            if (!result) {
                return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
            }
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new AuthController();
