// webhooks/webhook-meta.js
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { enviarWhatsApp } = require('../services/whatsapp');

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'fideliza_verify_token';

/**
 * GET /webhooks/meta/whatsapp
 * Meta llama este endpoint para verificar el webhook
 */
router.get('/whatsapp', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Webhook Meta] Verificación exitosa');
    return res.status(200).send(challenge);
  }
  console.log('[Webhook Meta] Verificación fallida');
  res.status(403).send('Forbidden');
});

/**
 * POST /webhooks/meta/whatsapp
 * Meta llama este endpoint cuando llega un mensaje de WhatsApp
 */
router.post('/whatsapp', async (req, res) => {
  try {
    // Responder 200 inmediatamente para que Meta no reintente
    res.status(200).send('OK');

    const body = req.body;

    if (body.object !== 'whatsapp_business_account') return;

    const entry    = body.entry?.[0];
    const changes  = entry?.changes?.[0];
    const value    = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) return;

    const message  = messages[0];
    const telefono = '+' + message.from;
    const texto    = (message.text?.body || '').toLowerCase().trim();

    console.log(`[Webhook Meta] Mensaje de ${telefono}: "${message.text?.body}"`);

    // Buscar si el cliente existe
    const { rows: [cliente] } = await pool.query(
      'SELECT * FROM clientes WHERE telefono = $1', [telefono]
    );

    if (!cliente) {
      console.log(`[Webhook Meta] Cliente no encontrado: ${telefono}`);
      return;
    }

    // Verificar si ya se envió bienvenida recientemente (evitar duplicados)
    const { rows: [yaEnviado] } = await pool.query(
      `SELECT id FROM mensajes_whatsapp
       WHERE cliente_id = $1
         AND tipo = 'bienvenida'
         AND estado = 'enviado'
         AND creado_en > NOW() - INTERVAL '1 hour'`,
      [cliente.id]
    );

    if (yaEnviado) {
      console.log(`[Webhook Meta] Bienvenida ya enviada recientemente a ${telefono}`);
      return;
    }

    // Enviar mensaje de bienvenida
    await enviarWhatsApp({
      clienteId: cliente.id,
      telefono:  cliente.telefono,
      tipo:      'bienvenida',
      nombre:    cliente.nombre,
      local:     cliente.local || 'mujer',
    });

  } catch (err) {
    console.error('[Webhook Meta] Error:', err.message);
  }
});

module.exports = router;
