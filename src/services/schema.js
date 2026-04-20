require('dotenv').config();

async function initSchema() {
  const db = require('../../config/db');
  console.log('[Schema] Inicializando (SQLite)...');

  const tablas = [
    `CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      rol TEXT DEFAULT 'admin',
      creado_en TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL UNIQUE,
      email TEXT,
      qr_origen TEXT DEFAULT 'directo',
      local TEXT DEFAULT 'mujer',
      fecha_nacimiento TEXT,
      puntos INTEGER DEFAULT 0,
      nivel TEXT DEFAULT 'bronce',
      segmento TEXT DEFAULT 'nuevo',
      es_vip INTEGER DEFAULT 0,
      total_gastado REAL DEFAULT 0,
      ultima_compra TEXT,
      notas TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS compras (
      id TEXT PRIMARY KEY,
      cliente_id TEXT,
      monto REAL NOT NULL,
      descripcion TEXT,
      origen TEXT DEFAULT 'manual',
      orden_externa TEXT,
      puntos_ganados INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS canjes (
      id TEXT PRIMARY KEY,
      cliente_id TEXT,
      tipo TEXT NOT NULL,
      descripcion TEXT,
      puntos_usados INTEGER DEFAULT 0,
      codigo TEXT UNIQUE,
      usado INTEGER DEFAULT 0,
      usado_en TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
      id TEXT PRIMARY KEY,
      cliente_id TEXT,
      telefono TEXT NOT NULL,
      tipo TEXT,
      mensaje TEXT NOT NULL,
      estado TEXT DEFAULT 'simulado',
      twilio_sid TEXT,
      local_origen TEXT DEFAULT 'mujer',
      creado_en TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS campanas (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      segmento TEXT NOT NULL,
      local TEXT DEFAULT 'todos',
      estado TEXT DEFAULT 'borrador',
      total_enviados INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now')),
      enviado_en TEXT
    )`
  ];

  for (const sql of tablas) {
    await db.query(sql);
  }

  // Migraciones para bases de datos existentes (agrega columna si no existe)
  const migraciones = [
    `ALTER TABLE clientes ADD COLUMN local TEXT DEFAULT 'mujer'`,
    `ALTER TABLE clientes ADD COLUMN fecha_nacimiento TEXT`,
    `ALTER TABLE campanas ADD COLUMN local TEXT DEFAULT 'todos'`,
    `ALTER TABLE mensajes_whatsapp ADD COLUMN local_origen TEXT DEFAULT 'mujer'`,
  ];
  for (const sql of migraciones) {
    try { await db.query(sql); } catch (_) { /* columna ya existe, ignorar */ }
  }

  console.log('[Schema] Listo ✓');
}

module.exports = { initSchema };
