// routes/dashboard.js — compatible con PostgreSQL
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const auth    = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const [
      { rows: [totales] },
      { rows: segmentos },
      { rows: niveles },
      { rows: ventasRecientes },
      { rows: [mensajesHoy] },
    ] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) as total_clientes,
          SUM(CASE WHEN segmento != 'inactivo' THEN 1 ELSE 0 END) as activos,
          SUM(CASE WHEN segmento = 'inactivo'  THEN 1 ELSE 0 END) as inactivos,
          SUM(CASE WHEN es_vip = true          THEN 1 ELSE 0 END) as vip,
          COALESCE(SUM(total_gastado), 0)  as ventas_totales,
          COALESCE(AVG(CASE WHEN total_gastado > 0 THEN total_gastado END), 0) as ticket_promedio
        FROM clientes
      `),
      pool.query(`SELECT segmento, COUNT(*) as cantidad FROM clientes GROUP BY segmento`),
      pool.query(`SELECT nivel, COUNT(*) as cantidad FROM clientes GROUP BY nivel`),
      pool.query(`
        SELECT c.nombre, cp.monto, cp.creado_en, cp.descripcion
        FROM compras cp JOIN clientes c ON c.id = cp.cliente_id
        ORDER BY cp.creado_en DESC LIMIT 10
      `),
      pool.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN estado='enviado'  THEN 1 ELSE 0 END) as enviados,
          SUM(CASE WHEN estado='simulado' THEN 1 ELSE 0 END) as simulados
        FROM mensajes_whatsapp
        WHERE creado_en > NOW() - INTERVAL '1 day'
      `),
    ]);

    res.json({
      totales,
      segmentos,
      niveles,
      ventasRecientes,
      mensajesHoy: mensajesHoy || { total: 0, enviados: 0, simulados: 0 },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
