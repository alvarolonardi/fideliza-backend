// webhooks/twilio.js
const express = require('express');
const router  = express.Router();
const { enviarWhatsApp } = require('../services/whatsapp');
const pool = require('../../config/db');

/**
 * POST /webhooks/twilio/whatsapp
 * Twilio llama este endpoint cuando llega un mensaje de WhatsApp
 */
router.post('/whatsapp', async (req, res) => {
  try {
    const { From, Body } = req.body;

    // Extraer el número limpio (Twilio manda "whatsapp:+549XXXXXXXXXX")
    const telefono = From.replace('whatsapp:', '');
    const mensaje  = (Body || '').toLowerCase().trim();

    console.log(`[Webhook Twilio] Mensaje de ${telefono}: "${Body}"`);

    // Buscar si el cliente existe
    const { rows: [cliente] } = await pool.query(
      'SELECT * FROM clientes WHERE telefono = $1', [telefono]
    );

    if (!cliente) {
      // No está registrado, ignorar
      return res.status(200).send('<Response></Response>');
    }

    // Si el mensaje es de bienvenida, responder con mensaje de bienvenida
    if (mensaje.includes('registr') || mensaje.includes('hola')) {
      await enviarWhatsApp({
        clienteId: cliente.id,
        telefono:  cliente.telefono,
        tipo:      'bienvenida',
        nombre:    cliente.nombre,
        local:     cliente.local || 'mujer',
      });
    }

    // Respuesta vacía para que Twilio no reintente
    res.status(200).send('<Response></Response>');
  } catch (err) {
    console.error('[Webhook Twilio] Error:', err.message);
    res.status(500).send('<Response></Response>');
  }
});

module.exports = router;