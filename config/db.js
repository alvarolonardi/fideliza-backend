require('dotenv').config();

const usePostgres = !!process.env.DATABASE_URL;

let pool;

if (usePostgres) {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log('[DB] PostgreSQL conectado');
} else {
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const dbPath = path.resolve(process.env.SQLITE_PATH || './fideliza.db');
  const sqlite = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('[DB] Error al abrir SQLite:', err.message);
    else console.log('[DB] SQLite conectado en:', dbPath);
  });
  sqlite.run('PRAGMA journal_mode=WAL');
  sqlite.run('PRAGMA foreign_keys=ON');

  pool = {
    _type: 'sqlite',
    query: (sql, params = []) => {
      const s = sql.replace(/\$\d+/g, '?');
      return new Promise((resolve, reject) => {
        const trimmed = s.trim().toUpperCase();
        if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
          sqlite.all(s, params, (err, rows) => {
            if (err) reject(err);
            else resolve({ rows: rows || [] });
          });
        } else {
          sqlite.run(s, params, function(err) {
            if (err) reject(err);
            else resolve({ rows: [], lastID: this.lastID, changes: this.changes });
          });
        }
      });
    },
    connect: async () => ({ query: pool.query, release: () => {} }),
  };
}

pool._type = usePostgres ? 'postgresql' : 'sqlite';
module.exports = pool;
