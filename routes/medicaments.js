const medicamentRepository = require('../repositories/medicamentRepository');
const authenticateToken = require('../middleware/auth');
const isAdmin = require('../middleware/roleMiddleware');
const express = require('express');
const router = express.Router();

// GET tous les médicaments (Actifs seulement pour les délégués)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const rows = req.user.role === 'admin'
      ? await medicamentRepository.getAll()
      : await medicamentRepository.getAllActive();
    res.json(rows);
  } catch (err) {
    console.error('[Medicaments] Error:', err && err.code, err && err.message);
    if (
      err &&
      (err.code === 'ER_NO_SUCH_TABLE' ||
        (typeof err.message === 'string' && err.message.includes("doesn't exist")))
    ) {
      return res.json([]);
    }
    res.status(500).json({ error: err.message });
  }
});

// GET un médicament par ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const med = await medicamentRepository.findById(req.params.id);
    if (!med) return res.status(404).json({ error: 'Médicament non trouvé' });

    // Parser les JSON strings
    med.effets_indesirables = JSON.parse(med.effets_indesirables || '[]');
    med.contre_indications = JSON.parse(med.contre_indications || '[]');
    med.questions_type = JSON.parse(med.questions_type || '[]');

    res.json(med);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN ONLY ──────────────────────────────────────────────────

// POST nouveau médicament
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const id = await medicamentRepository.create(req.body);
    res.status(201).json({ id, message: 'Médicament créé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT modifier médicament
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await medicamentRepository.update(req.params.id, req.body);
    res.json({ message: 'Médicament mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE médicament
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await medicamentRepository.delete(req.params.id);
    res.json({ message: 'Médicament supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET médicaments inconnus détectés
router.get('/admin/unknown', authenticateToken, isAdmin, async (req, res) => {
  try {
    const rows = await medicamentRepository.getUnknownMeds();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE médicament inconnu
router.delete('/admin/unknown/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await medicamentRepository.deleteUnknownMed(req.params.id);
    res.json({ message: 'Entrée supprimée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;