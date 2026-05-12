const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const authenticateToken = require('../middleware/auth');

router.post('/register', async (req, res) => {
  const { nom, prenom, email, mot_de_passe } = req.body;
  try {
    console.log('[Auth] /register hit with body:', { nom, prenom, email });
    if (!nom || !email || !mot_de_passe) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const hash = await bcrypt.hash(mot_de_passe, 10);
    const id = uuidv4();

    await pool.query(
      `INSERT INTO utilisateurs (id, nom, prenom, email, mot_de_passe, date_inscription) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [id, nom, prenom || '', email, hash]
    );

    return res.status(201).json({ message: 'Compte créé avec succès' });
  } catch (err) {
    console.error('[Auth] /register error:', err.code, err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email deja utilise' });
    }
    return res.status(500).json({ error: 'Erreur serveur lors de la création du compte' });
  }
});

router.post('/login', async (req, res) => {
  const { email, mot_de_passe } = req.body;
  try {
    console.log('[Auth] /login hit with body:', { email });
    if (!email || !mot_de_passe) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM utilisateurs WHERE email = ?',
      [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    const user = rows[0];
    const valid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('[Auth] JWT_SECRET manquant');
      return res.status(500).json({ error: 'Erreur configuration JWT' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role || 'delegue', nom: user.nom, prenom: user.prenom },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    return res.json({
      token,
      user: { id: user.id, nom: user.nom, prenom: user.prenom, role: user.role || 'delegue' }
    });
  } catch (err) {
    console.error('[Auth] /login error:', err.code, err.message);
    return res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
});

router.post('/admin/login', async (req, res) => {
  const { email, mot_de_passe } = req.body;
  try {
    console.log('[Auth] /admin/login hit with body:', { email });
    if (!email || !mot_de_passe) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM administrateurs WHERE email = ?',
      [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const admin = rows[0];
    // NOTE: Si les mots de passe ne sont pas hachés en base pour les admins, retirez bcrypt.compare
    const valid = await bcrypt.compare(mot_de_passe, admin.mot_de_passe).catch(() => mot_de_passe === admin.mot_de_passe);

    if (!valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'Erreur configuration JWT' });
    }

    const token = jwt.sign(
      { id: admin.id, role: 'admin', nom: admin.nom, prenom: admin.prenom },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      token,
      user: { id: admin.id, nom: admin.nom, prenom: admin.prenom, role: 'admin' }
    });
  } catch (err) {
    console.error('[Auth] /admin/login error:', err.code, err.message);
    return res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nom, prenom, email, role FROM utilisateurs WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const user = rows[0];
    return res.json({
      id: user.id,
      nom: user.nom || '',
      prenom: user.prenom || '',
      email: user.email || '',
      role: user.role || 'delegue'
    });
  } catch (err) {
    console.error('[Auth] /me error:', err.code, err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/me', authenticateToken, async (req, res) => {
  const nom = String(req.body?.nom || '').trim();
  const prenom = String(req.body?.prenom || '').trim();
  const email = String(req.body?.email || '').trim();

  if (!nom || !email) {
    return res.status(400).json({ error: 'Nom et email sont requis' });
  }

  try {
    const [dupRows] = await pool.query(
      'SELECT id FROM utilisateurs WHERE email = ? AND id <> ? LIMIT 1',
      [email, req.user.id]
    );
    if (dupRows.length) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }

    await pool.query(
      'UPDATE utilisateurs SET nom = ?, prenom = ?, email = ? WHERE id = ?',
      [nom, prenom, email, req.user.id]
    );

    return res.json({
      message: 'Profil mis à jour',
      user: { id: req.user.id, nom, prenom, email, role: req.user.role || 'delegue' }
    });
  } catch (err) {
    console.error('[Auth] PUT /me error:', err.code, err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/change-password', authenticateToken, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, mot_de_passe FROM utilisateurs WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const user = rows[0];
    const valid = await bcrypt.compare(currentPassword, user.mot_de_passe);
    if (!valid) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    }

    const nextHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?',
      [nextHash, req.user.id]
    );

    return res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) {
    console.error('[Auth] PUT /change-password error:', err.code, err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;