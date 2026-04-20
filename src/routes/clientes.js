const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const auth    = require('../middleware/auth');
const { registrarCompra, RECOMPENSAS } = require('../services/puntos');
const { triggerPostCompra, triggerVIP } = require('../services/automatizacion');
const { enviarWhatsApp } = require('../services/whatsapp');
const { v4: uuidv4 } = require('uuid');

// ─── GET /clientes ─────────────────────────────────────────
// Lista con filtros opcionales: ?segmento=vip&q=nombre
router.get('/', auth, async (req, res) => {
  try {
    const { segmento, q, nivel, page = 1, limit = 50 } = req.query;
    const params = [];
    const where  = [];
    let idx = 1;

    if (segmento) { where.push(`segmento = $${idx++}`); params.push(segmento); }
    if (nivel)    { where.push(`nivel = $${idx++}`);    params.push(nivel);    }
    if (q)        {
      where.push(`(nombre ILIKE $${idx} OR telefono ILIKE $${idx})`);
      params.push(`%${q}%`); idx++;
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset   = (parseInt(page) - 1) * parseInt(limit);

    const { rows } = await pool.query(
      `SELECT * FROM clientes ${whereSQL}
       ORDER BY creado_en DESC
       LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, parseInt(limit), offset]
    );

    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*) FROM clientes ${whereSQL}`, params
    );

    res.json({ clientes: rows, total: parseInt(count), page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /clientes/:id ────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows: [cliente] } = await pool.query(
      'SELECT * FROM clientes WHERE id = $1', [req.params.id]
    );
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const { rows: compras } = await pool.query(
      'SELECT * FROM compras WHERE cliente_id = $1 ORDER BY creado_en DESC LIMIT 20',
      [req.params.id]
    );
    const { rows: mensajes } = await pool.query(
      'SELECT * FROM mensajes_whatsapp WHERE cliente_id = $1 ORDER BY creado_en DESC LIMIT 10',
      [req.params.id]
    );

    res.json({ ...cliente, compras, mensajes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /clientes/registro (público, desde QR) ──────────
router.post('/registro', async (req, res) => {
  try {
    const { nombre, telefono, email, qr_origen, local, fecha_nacimiento } = req.body;
    if (!nombre || !telefono) {
      return res.status(400).json({ error: 'Nombre y teléfono son requeridos' });
    }
    if (!local || !['mujer', 'hombre'].includes(local)) {
      return res.status(400).json({ error: 'Seleccioná un local: Mujer u Hombre' });
    }

    // Verificar si ya existe
    const { rows: [existe] } = await pool.query(
      'SELECT id FROM clientes WHERE telefono = $1', [telefono]
    );
    if (existe) {
      return res.json({ mensaje: 'Ya estás registrado/a ✓', clienteId: existe.id, nuevo: false });
    }

    const id = require('uuid').v4();
    await pool.query(
      `INSERT INTO clientes (id, nombre, telefono, email, qr_origen, local, fecha_nacimiento)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, nombre, telefono, email, qr_origen || 'directo', local, fecha_nacimiento || null]
    );

    // Leer el cliente recién creado
    const { rows: [cliente] } = await pool.query(
      'SELECT * FROM clientes WHERE id = $1', [id]
    );

    // Mensaje de bienvenida automático — usa el número del local correspondiente
    await enviarWhatsApp({
      clienteId: cliente.id,
      telefono:  cliente.telefono,
      tipo:      'bienvenida',
      nombre:    cliente.nombre,
      local:     cliente.local,
    });

    const saludo = local === 'hombre' ? '¡Bienvenido! 🎉' : '¡Bienvenida! 🎉';
    res.status(201).json({ mensaje: saludo, cliente, nuevo: true });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este teléfono ya está registrado' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /clientes/:id ────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const { nombre, telefono, email, notas, es_vip } = req.body;
    const { rows: [cliente] } = await pool.query(
      `UPDATE clientes SET nombre=$1, telefono=$2, email=$3, notas=$4, es_vip=$5
       WHERE id=$6 RETURNING *`,
      [nombre, telefono, email, notas, es_vip, req.params.id]
    );
    if (!cliente) return res.status(404).json({ error: 'No encontrado' });

    // Si lo marcamos VIP, enviar mensaje especial
    if (es_vip) {
      await triggerVIP(cliente.id, cliente.telefono, cliente.nombre);
    }

    res.json(cliente);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /clientes/:id/compra ────────────────────────────
router.post('/:id/compra', auth, async (req, res) => {
  try {
    const { monto, descripcion } = req.body;
    if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });

    const resultado = await registrarCompra({
      clienteId: req.params.id,
      monto: parseFloat(monto),
      descripcion,
      origen: 'manual',
    });

    // Trigger post-compra inmediato
    const { rows: [c] } = await pool.query('SELECT nombre, telefono FROM clientes WHERE id=$1', [req.params.id]);
    await triggerPostCompra(req.params.id, c.telefono, c.nombre);

    // Si subió a VIP
    if (resultado.nivel === 'vip') {
      await triggerVIP(req.params.id, c.telefono, c.nombre);
    }

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /clientes/:id/mensaje ───────────────────────────
router.post('/:id/mensaje', auth, async (req, res) => {
  try {
    const { tipo, mensajePersonalizado } = req.body;
    const { rows: [c] } = await pool.query('SELECT * FROM clientes WHERE id=$1', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });

    const resultado = await enviarWhatsApp({
      clienteId: c.id,
      telefono: c.telefono,
      tipo: tipo || 'manual',
      nombre: c.nombre,
      extra: { mensajePersonalizado, puntos: c.puntos, nivel: c.nivel },
    });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /clientes/:id/recompensas ────────────────────────
router.get('/:id/recompensas', async (req, res) => {
  const { rows: [c] } = await pool.query('SELECT puntos, nivel FROM clientes WHERE id=$1', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'No encontrado' });

  const disponibles = RECOMPENSAS.filter(r => {
    if (r.nivel_min && c.nivel !== r.nivel_min && c.nivel !== 'vip') return false;
    return c.puntos >= r.puntos;
  });

  res.json({ puntos: c.puntos, nivel: c.nivel, recompensas: disponibles });
});

// ─── POST /clientes/:id/canje ─────────────────────────────
router.post('/:id/canje', async (req, res) => {
  try {
    const { recompensaId } = req.body;
    const recompensa = RECOMPENSAS.find(r => r.id === recompensaId);
    if (!recompensa) return res.status(404).json({ error: 'Recompensa no encontrada' });

    const { rows: [c] } = await pool.query('SELECT * FROM clientes WHERE id=$1', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (c.puntos < recompensa.puntos) return res.status(400).json({ error: 'Puntos insuficientes' });

    const codigo = `FID-${uuidv4().slice(0,8).toUpperCase()}`;

    await pool.query(
      `INSERT INTO canjes (cliente_id, tipo, descripcion, puntos_usados, codigo)
       VALUES ($1, $2, $3, $4, $5)`,
      [c.id, recompensa.tipo, recompensa.nombre, recompensa.puntos, codigo]
    );

    await pool.query(
      'UPDATE clientes SET puntos = puntos - $1 WHERE id = $2',
      [recompensa.puntos, c.id]
    );

    res.json({ codigo, recompensa: recompensa.nombre, puntosUsados: recompensa.puntos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ─── DELETE /clientes/:id ───────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
    res.json({ ok: true, mensaje: 'Cliente eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
