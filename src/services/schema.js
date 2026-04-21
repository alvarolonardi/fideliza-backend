require('dotenv').config();

async function initSchema() {
  const db = require('../../config/db');
  const usePostgres = !!process.env.DATABASE_URL;

  if (usePostgres) {
    console.log('[Schema] Inicializando (PostgreSQL)...');

    const tablas = [
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
      `CREATE TABLE IF NOT EXISTS admins (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash VARCHAR(200) NOT NULL,
        rol VARCHAR(20) DEFAULT 'admin',
        creado_en TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS clientes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre VARCHAR(100) NOT NULL,
        telefono VARCHAR(30) NOT NULL UNIQUE,
        email VARCHAR(150),
        qr_origen VARCHAR(100) DEFAULT 'directo',
        local VARCHAR(20) DEFAULT 'mujer',
        fecha_nacimiento VARCHAR(20),
        puntos INTEGER DEFAULT 0,
        nivel VARCHAR(20) DEFAULT 'bronce',
        segmento VARCHAR(20) DEFAULT 'nuevo',
        es_vip BOOLEAN DEFAULT FALSE,
        total_gastado NUMERIC(12,2) DEFAULT 0,
        ultima_compra TIMESTAMP,
        notas TEXT,
        creado_en TIMESTAMP DEFAULT NOW(),
        actualizado_en TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS compras (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
        monto NUMERIC(12,2) NOT NULL,
        descripcion TEXT,
        origen VARCHAR(50) DEFAULT 'manual',
        orden_externa VARCHAR(100),
        puntos_ganados INTEGER DEFAULT 0,
        creado_en TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS canjes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
        tipo VARCHAR(50) NOT NULL,
        descripcion TEXT,
        puntos_usados INTEGER DEFAULT 0,
        codigo VARCHAR(30) UNIQUE,
        usado BOOLEAN DEFAULT FALSE,
        usado_en TIMESTAMP,
        creado_en TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
        telefono VARCHAR(30) NOT NULL,
        tipo VARCHAR(50),
        mensaje TEXT NOT NULL,
        estado VARCHAR(20) DEFAULT 'simulado',
        twilio_sid VARCHAR(100),
        local_origen VARCHAR(20) DEFAULT 'mujer',
        creado_en TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS campanas (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre VARCHAR(100) NOT NULL,
        mensaje TEXT NOT NULL,
        segmento VARCHAR(30) NOT NULL,
        local VARCHAR(20) DEFAULT 'todos',
        estado VARCHAR(20) DEFAULT 'borrador',
        total_enviados INTEGER DEFAULT 0,
        creado_en TIMESTAMP DEFAULT NOW(),
        enviado_en TIMESTAMP
      )`
    ];

    for (const sql of tablas) {
      await db.query(sql);
    }

  } else {
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

    const migraciones = [
      `ALTER TABLE clientes ADD COLUMN local TEXT DEFAULT 'mujer'`,
      `ALTER TABLE clientes ADD COLUMN fecha_nacimiento TEXT`,
      `ALTER TABLE campanas ADD COLUMN local TEXT DEFAULT 'todos'`,
      `ALTER TABLE mensajes_whatsapp ADD COLUMN local_origen TEXT DEFAULT 'mujer'`,
    ];
    for (const sql of migraciones) {
      try { await db.query(sql); } catch (_) { /* columna ya existe, ignorar */ }
    }
  }

  console.log('[Schema] Listo ✓');
}

module.exports = { initSchema };
