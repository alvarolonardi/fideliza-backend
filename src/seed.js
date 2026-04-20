require('dotenv').config();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { initSchema } = require('./services/schema');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  console.log('\n Iniciando seed de Fideliza...\n');
  await initSchema();

  // Limpiar tablas en orden correcto
  for (const t of ['mensajes_whatsapp','campanas','canjes','compras','clientes','admins']) {
    try { await db.query(`DELETE FROM ${t}`); } catch(e) {}
  }

  // Admin
  const hash = await bcrypt.hash('admin123', 10);
  await db.query(
    'INSERT INTO admins (id,nombre,email,password_hash) VALUES (?,?,?,?)',
    [uuidv4(),'Admin','admin@fideliza.com',hash]
  );
  console.log('  Admin creado: admin@fideliza.com / admin123');

  const ahora = Date.now();
  const hace = (d) => new Date(ahora - d*86400000).toISOString();

  const clientes = [
    { nombre:'Valentina Garcia',  telefono:'+5491134567890', puntos:4820, nivel:'oro',    segmento:'frecuente', esVip:0, total:48200, dias:2  },
    { nombre:'Lucia Martinez',    telefono:'+5491145678901', puntos:12100,nivel:'vip',    segmento:'vip',       esVip:1, total:121000,dias:1  },
    { nombre:'Sofia Rodriguez',   telefono:'+5491156789012', puntos:2340, nivel:'plata',  segmento:'frecuente', esVip:0, total:23400, dias:6  },
    { nombre:'Camila Torres',     telefono:'+5491167890123', puntos:870,  nivel:'bronce', segmento:'nuevo',     esVip:0, total:8700,  dias:12 },
    { nombre:'Florencia Lopez',   telefono:'+5491178901234', puntos:300,  nivel:'bronce', segmento:'inactivo',  esVip:0, total:3000,  dias:40 },
  ];

  const ids = [];
  for (const c of clientes) {
    const id = uuidv4();
    ids.push(id);
    await db.query(
      'INSERT INTO clientes (id,nombre,telefono,puntos,nivel,segmento,es_vip,total_gastado,ultima_compra) VALUES (?,?,?,?,?,?,?,?,?)',
      [id,c.nombre,c.telefono,c.puntos,c.nivel,c.segmento,c.esVip,c.total,hace(c.dias)]
    );
  }
  console.log(`  ${clientes.length} clientes creados`);

  // Compras
  const compras = [
    [ids[0],8200,'Vestido lino',2],[ids[0],12500,'Conjunto primavera',15],
    [ids[1],25000,'Coleccion VIP',1],[ids[2],9800,'Tapado trench',6],
  ];
  for (const [cid,monto,desc,dias] of compras) {
    await db.query(
      'INSERT INTO compras (id,cliente_id,monto,descripcion,puntos_ganados,creado_en) VALUES (?,?,?,?,?,?)',
      [uuidv4(),cid,monto,desc,Math.floor(monto/100),hace(dias)]
    );
  }
  console.log(`  ${compras.length} compras creadas`);

  // Campaña
  await db.query(
    'INSERT INTO campanas (id,nombre,mensaje,segmento,estado) VALUES (?,?,?,?,?)',
    [uuidv4(),'Lanzamiento nueva coleccion','Llego lo nuevo! Te esperamos.','todos','borrador']
  );
  console.log('  1 campana de ejemplo creada');

  console.log('\n Seed completado exitosamente!');
  console.log('  Panel: http://localhost:3000');
  console.log('  Login: admin@fideliza.com / admin123\n');
  process.exit(0);
}

seed().catch(err => { console.error('Error:', err.message); process.exit(1); });
