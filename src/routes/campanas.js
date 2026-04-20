const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const auth    = require('../middleware/auth');
const { enviarCampana } = require('../services/whatsapp');

// GET /campanas — lista todas, con filtro opcional por local
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM campanas ORDER BY creado_en DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /campanas — crear nueva campaña
router.post('/', auth, async (req, res) => {
  try {
    const { nombre, mensaje, segmento, local = 'todos' } = req.body;
    if (!nombre || !mensaje || !segmento) {
      return res.status(400).json({ error: 'nombre, mensaje y segmento son requeridos' });
    }
    if (!['todos', 'mujer', 'hombre'].includes(local)) {
      return res.status(400).json({ error: 'local debe ser: todos, mujer o hombre' });
    }

    const { rows: [camp] } = await pool.query(
      'INSERT INTO campanas (nombre, mensaje, segmento, local) VALUES ($1,$2,$3,$4) RETURNING *',
      [nombre, mensaje, segmento, local]
    );
    res.status(201).json(camp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /campanas/:id/enviar — enviar campaña
router.post('/:id/enviar', auth, async (req, res) => {
  try {
    const { rows: [camp] } = await pool.query('SELECT * FROM campanas WHERE id=$1', [req.params.id]);
    if (!camp) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (camp.estado === 'enviada') return res.status(400).json({ error: 'Ya fue enviada' });

    const resultado = await enviarCampana({
      campanaId: camp.id,
      nombre:    camp.nombre,
      mensaje:   camp.mensaje,
      segmento:  camp.segmento,
      local:     camp.local || 'todos',
    });
    res.json({ mensaje: 'Campaña enviada', ...resultado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
