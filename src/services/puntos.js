/**
 * Servicio de puntos y segmentación
 * Reglas de negocio centralizadas
 */

const pool = require('../../config/db');

// ─── Reglas de puntos ────────────────────────────────────────
// 1 punto por cada $100 gastados (ajustar según moneda/negocio)
const PUNTOS_POR_100 = 1;

// Umbrales de nivel
const NIVELES = {
  bronce: { min: 0,    max: 499  },
  plata:  { min: 500,  max: 1999 },
  oro:    { min: 2000, max: 5999 },
  vip:    { min: 6000, max: Infinity },
};

// Tabla de recompensas disponibles
const RECOMPENSAS = [
  { id: 'descuento_10', nombre: 'Descuento 10%',    puntos: 300,  tipo: 'descuento' },
  { id: 'descuento_15', nombre: 'Descuento 15%',    puntos: 500,  tipo: 'descuento' },
  { id: 'envio_gratis', nombre: 'Envío gratis',      puntos: 200,  tipo: 'envio'     },
  { id: 'packaging_vip', nombre: 'Packaging premium', puntos: 150, tipo: 'regalo'    },
  { id: 'preventa',     nombre: 'Acceso preventa',   puntos: 0,    tipo: 'exclusivo', nivel_min: 'vip' },
];

// ─── Calcular puntos de una compra ──────────────────────────
function calcularPuntos(monto) {
  return Math.floor(monto / 100) * PUNTOS_POR_100;
}

// ─── Calcular nivel según puntos ────────────────────────────
function calcularNivel(puntos) {
  for (const [nivel, rango] of Object.entries(NIVELES)) {
    if (puntos >= rango.min && puntos <= rango.max) return nivel;
  }
  return 'bronce';
}

// ─── Calcular segmento según comportamiento ─────────────────
function calcularSegmento(cliente) {
  if (cliente.es_vip || cliente.nivel === 'vip') return 'vip';

  const ahora = new Date();
  const diasSinCompra = cliente.ultima_compra
    ? (ahora - new Date(cliente.ultima_compra)) / (1000 * 60 * 60 * 24)
    : 999;

  if (diasSinCompra > 30) return 'inactivo';
  if (cliente.total_gastado >= 50000) return 'frecuente';
  return 'nuevo';
}

// ─── Registrar compra y actualizar cliente ──────────────────
async function registrarCompra({ clienteId, monto, descripcion, origen, ordenExterna }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const puntosGanados = calcularPuntos(monto);

    // Insertar compra
    const { rows: [compra] } = await client.query(
      `INSERT INTO compras (cliente_id, monto, descripcion, origen, orden_externa, puntos_ganados)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [clienteId, monto, descripcion, origen || 'manual', ordenExterna, puntosGanados]
    );

    // Actualizar cliente: sumar puntos, monto y fecha
    const { rows: [clienteActualizado] } = await client.query(
      `UPDATE clientes
       SET puntos        = puntos + $1,
           total_gastado = total_gastado + $2,
           ultima_compra = NOW()
       WHERE id = $3
       RETURNING *`,
      [puntosGanados, monto, clienteId]
    );

    // Recalcular nivel y segmento
    const nuevoNivel    = calcularNivel(clienteActualizado.puntos);
    const nuevoSegmento = calcularSegmento(clienteActualizado);
    const esVip         = nuevoNivel === 'vip';

    await client.query(
      `UPDATE clientes SET nivel=$1, segmento=$2, es_vip=$3 WHERE id=$4`,
      [nuevoNivel, nuevoSegmento, esVip, clienteId]
    );

    await client.query('COMMIT');

    return {
      compra,
      puntosGanados,
      nivel: nuevoNivel,
      segmento: nuevoSegmento,
      totalPuntos: clienteActualizado.puntos + puntosGanados,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Recalcular todos los segmentos (cron diario) ───────────
async function recalcularSegmentos() {
  const { rows: clientes } = await pool.query('SELECT * FROM clientes');
  let actualizados = 0;

  for (const c of clientes) {
    const nivel    = calcularNivel(c.puntos);
    const segmento = calcularSegmento(c);
    const esVip    = nivel === 'vip';

    await pool.query(
      'UPDATE clientes SET nivel=$1, segmento=$2, es_vip=$3 WHERE id=$4',
      [nivel, segmento, esVip, c.id]
    );
    actualizados++;
  }

  console.log(`[Segmentos] Actualizados: ${actualizados} clientes`);
  return actualizados;
}

module.exports = {
  calcularPuntos,
  calcularNivel,
  calcularSegmento,
  registrarCompra,
  recalcularSegmentos,
  RECOMPENSAS,
  NIVELES,
};
