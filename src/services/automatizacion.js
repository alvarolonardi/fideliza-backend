/**
 * Motor de automatización
 * Triggers automáticos por WhatsApp:
 *   - 3 días post-compra  → cross_sell
 *   - 25 días sin compra  → reactivacion
 *   - Cumpleaños del día  → cumpleanos (a las 10:00 AM)
 *   - Sube a VIP          → vip (se dispara en el momento)
 */

const cron = require('node-cron');
const pool = require('../../config/db');
const { enviarWhatsApp } = require('./whatsapp');
const { recalcularSegmentos } = require('./puntos');

// ─── Trigger: 3 días post-compra (cross sell) ────────────────
async function triggerCrossSell3Dias() {
  const { rows } = await pool.query(`
    SELECT DISTINCT c.id, c.nombre, c.telefono, c.local
    FROM clientes c
    JOIN compras cp ON cp.cliente_id = c.id
    WHERE cp.creado_en BETWEEN NOW() - INTERVAL '3 days' - INTERVAL '2 hours'
                            AND NOW() - INTERVAL '2 days' + INTERVAL '2 hours'
      AND NOT EXISTS (
        SELECT 1 FROM mensajes_whatsapp m
        WHERE m.cliente_id = c.id
          AND m.tipo = 'cross_sell'
          AND m.creado_en > NOW() - INTERVAL '4 days'
      )
  `);
  console.log(`[Automación] Cross-sell 3 días: ${rows.length} clientes`);
  for (const c of rows) {
    await enviarWhatsApp({ clienteId: c.id, telefono: c.telefono, tipo: 'cross_sell', nombre: c.nombre, local: c.local || 'mujer' });
  }
}

// ─── Trigger: 25 días sin compra (reactivación) ─────────────
async function triggerReactivacion() {
  const { rows } = await pool.query(`
    SELECT c.id, c.nombre, c.telefono, c.local
    FROM clientes c
    WHERE (c.ultima_compra < NOW() - INTERVAL '25 days'
           OR (c.ultima_compra IS NULL AND c.creado_en < NOW() - INTERVAL '25 days'))
      AND c.segmento = 'inactivo'
      AND NOT EXISTS (
        SELECT 1 FROM mensajes_whatsapp m
        WHERE m.cliente_id = c.id
          AND m.tipo = 'reactivacion'
          AND m.creado_en > NOW() - INTERVAL '30 days'
      )
  `);
  console.log(`[Automación] Reactivación: ${rows.length} clientes`);
  for (const c of rows) {
    await enviarWhatsApp({ clienteId: c.id, telefono: c.telefono, tipo: 'reactivacion', nombre: c.nombre, local: c.local || 'mujer' });
  }
}

// ─── Trigger: Cumpleaños del día ─────────────────────────────
async function triggerCumpleanos() {
  const { rows } = await pool.query(`
    SELECT c.id, c.nombre, c.telefono, c.local, c.fecha_nacimiento
    FROM clientes c
    WHERE c.fecha_nacimiento IS NOT NULL
      AND TO_CHAR(c.fecha_nacimiento::date, 'MM-DD') = TO_CHAR(NOW(), 'MM-DD')
      AND NOT EXISTS (
        SELECT 1 FROM mensajes_whatsapp m
        WHERE m.cliente_id = c.id
          AND m.tipo = 'cumpleanos'
          AND m.creado_en > NOW() - INTERVAL '1 day'
      )
  `);

  console.log(`[Automación] Cumpleaños hoy: ${rows.length} clientes`);
  for (const c of rows) {
    await enviarWhatsApp({
      clienteId: c.id,
      telefono:  c.telefono,
      tipo:      'cumpleanos',
      nombre:    c.nombre,
      local:     c.local || 'mujer',
    });
  }
}

// ─── Trigger manual: post-compra inmediato ───────────────────
async function triggerPostCompra(clienteId, telefono, nombre, local = 'mujer') {
  await enviarWhatsApp({ clienteId, telefono, tipo: 'post_compra', nombre, local });
}

// ─── Trigger manual: cliente VIP ─────────────────────────────
async function triggerVIP(clienteId, telefono, nombre, local = 'mujer') {
  await enviarWhatsApp({ clienteId, telefono, tipo: 'vip', nombre, local });
}

// ─── Iniciar cron jobs ───────────────────────────────────────
function iniciarAutomaciones() {
  // Cada día a las 10:00 → automaciones + cumpleaños
  cron.schedule('0 10 * * *', async () => {
    console.log('[Cron] Ejecutando automaciones diarias...');
    try {
      await recalcularSegmentos();
      await triggerCrossSell3Dias();
      await triggerReactivacion();
      await triggerCumpleanos();
    } catch (err) {
      console.error('[Cron] Error en automaciones:', err.message);
    }
  });

  console.log('[Automaciones] Cron jobs iniciados ✓');
}

module.exports = {
  iniciarAutomaciones,
  triggerPostCompra,
  triggerVIP,
  triggerCrossSell3Dias,
  triggerReactivacion,
  triggerCumpleanos,
};
