require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const { initSchema } = require('./services/schema');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/clientes',   require('./routes/clientes'));
app.use('/api/dashboard',  require('./routes/dashboard'));
app.use('/api/campanas',   require('./routes/campanas'));
app.use('/api/qr',         require('./routes/qr'));
app.use('/webhooks/tiendanube', require('./webhooks/tiendanube'));
app.use('/webhooks/twilio', require('./webhooks/twilio'));
// Endpoint para ver mensajes mock en tiempo real
app.get('/api/mensajes-log', require('./middleware/auth'), async (req, res) => {
  const db = require('../config/db');
  const { rows } = await db.query(
    `SELECT m.*, c.nombre FROM mensajes_whatsapp m
     LEFT JOIN clientes c ON c.id = m.cliente_id
     ORDER BY m.creado_en DESC LIMIT 50`
  );
  res.json(rows);
});

app.get('/health', (_, res) => res.json({ ok: true, db: require('../config/db')._type }));

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // Auto-init schema al arrancar (crea las tablas si no existen)
    await initSchema();
    app.listen(PORT, () => {
      console.log(`\n🚀 Fideliza API → http://localhost:${PORT}`);
      console.log(`   DB:        ${require('../config/db')._type}`);
      console.log(`   WhatsApp:  ${process.env.WHATSAPP_MOCK !== 'false' ? 'MOCK (consola)' : 'Twilio real'}`);
      console.log(`   Frontend:  ${process.env.FRONTEND_URL || 'http://localhost:3000'}\n`);
    });

    if (process.env.NODE_ENV !== 'test') {
      const { iniciarAutomaciones } = require('./services/automatizacion');
      iniciarAutomaciones();
    }
  } catch (err) {
    console.error('❌ Error al iniciar:', err.message);
    process.exit(1);
  }
}

start();
module.exports = app;
