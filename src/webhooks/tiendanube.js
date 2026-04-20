// webhooks/tiendanube.js
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { registrarCompra } = require('../services/puntos');
const { triggerPostCompra } = require('../services/automatizacion');

/**
 * POST /webhooks/tiendanube/orden-pagada
 * Tienda Nube llama este endpoint cuando se paga una orden
 */
router.post('/orden-pagada', async (req, res) => {
  try {
    const evento = req.body;
    console.log('[Webhook TiendaNube] Orden recibida:', evento.id);

    const { id: ordenId, total, customer } = evento;

    if (!customer?.phone) {
      return res.status(200).json({ mensaje: 'Sin teléfono, ignorado' });
    }

    const telefono = customer.phone.replace(/\D/g, '');
    const nombre   = `${customer.first_name} ${customer.last_name}`.trim();

    // Buscar o crear cliente
    let { rows: [cliente] } = await pool.query(
      'SELECT * FROM clientes WHERE telefono = $1', [telefono]
    );

    if (!cliente) {
      const { rows: [nuevo] } = await pool.query(
        `INSERT INTO clientes (nombre, telefono, email, qr_origen)
         VALUES ($1, $2, $3, 'tiendanube') RETURNING *`,
        [nombre, telefono, customer.email || null]
      );
      cliente = nuevo;
    }

    // Registrar compra
    await registrarCompra({
      clienteId: cliente.id,
      monto: parseFloat(total),
      descripcion: `Orden TiendaNube #${ordenId}`,
      origen: 'tiendanube',
      ordenExterna: String(ordenId),
    });

    // Trigger post-compra
    await triggerPostCompra(cliente.id, cliente.telefono, cliente.nombre);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Webhook TiendaNube] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /webhooks/tiendanube/cliente-actualizado
 */
router.post('/cliente-actualizado', async (req, res) => {
  try {
    const { customer } = req.body;
    if (!customer?.phone) return res.status(200).json({ ok: true });

    const telefono = customer.phone.replace(/\D/g, '');
    await pool.query(
      'UPDATE clientes SET nombre=$1, email=$2 WHERE telefono=$3',
      [`${customer.first_name} ${customer.last_name}`.trim(), customer.email, telefono]
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
