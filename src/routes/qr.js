// routes/qr.js
const express = require('express');
const router  = express.Router();
const QRCode  = require('qrcode');
const auth    = require('../middleware/auth');

// GET /qr/generar?origen=tienda_centro
// Genera un QR que apunta a la landing de registro
router.get('/generar', auth, async (req, res) => {
  try {
    const origen  = req.query.origen || 'qr_general';
    const baseUrl = process.env.QR_BASE_URL || 'http://localhost:3000/registro';
    const url     = `${baseUrl}?origen=${encodeURIComponent(origen)}`;

    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    });

    res.json({ qr: qrDataUrl, url, origen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /qr/imagen?origen=tienda_centro
// Devuelve el QR directamente como imagen PNG
router.get('/imagen', async (req, res) => {
  try {
    const origen  = req.query.origen || 'qr_general';
    const baseUrl = process.env.QR_BASE_URL || 'http://localhost:3000/registro';
    const url     = `${baseUrl}?origen=${encodeURIComponent(origen)}`;

    res.setHeader('Content-Type', 'image/png');
    await QRCode.toFileStream(res, url, {
      width: 400,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
