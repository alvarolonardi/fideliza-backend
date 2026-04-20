// routes/auth.js
const express  = require('express');
const router   = express.Router();
const pool     = require('../../config/db');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows: [admin] } = await pool.query(
      'SELECT * FROM admins WHERE email = $1', [email]
    );
    if (!admin) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = jwt.sign(
      { id: admin.id, email: admin.email, rol: admin.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ token, admin: { id: admin.id, nombre: admin.nombre, email: admin.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
