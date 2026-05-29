/**
 * Servicio WhatsApp — Casa Sierra
 * WHATSAPP_MOCK=true  → simula envío (logs en consola)
 * WHATSAPP_MOCK=false → envía real por Meta Cloud API usando plantillas aprobadas
 *
 * Variables de entorno necesarias en Railway:
 *   WHATSAPP_MOCK=false
 *   META_ACCESS_TOKEN=tu_token_permanente
 *   META_PHONE_NUMBER_ID=1180889151765006
 *   META_WHATSAPP_BUSINESS_ID=1144482394423445
 *
 * El número del cliente se normaliza automáticamente al formato +549XXXXXXXXXX
 */

const pool = require('../../config/db');

// ─── Normalizar número argentino ─────────────────────────────
function normalizarTelefono(tel) {
  let num = tel.replace(/[\s\-().]/g, '');
  if (num.startsWith('+')) return num;
  if (num.startsWith('0')) num = num.slice(1);
  if (num.startsWith('54')) {
    if (num.startsWith('549')) return '+' + num;
    return '+54' + '9' + num.slice(2);
  }
  return '+549' + num;
}

// ─── Envío real por Meta Cloud API usando plantillas ─────────
async function enviarPorMetaTemplate(telefonoNorm, templateName, components) {
  const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const accessToken   = process.env.META_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('Faltan variables META_PHONE_NUMBER_ID o META_ACCESS_TOKEN en Railway');
  }

  // Quitar el "+" para Meta (espera formato internacional sin +)
  const telefonoMeta = telefonoNorm.replace('+', '');

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefonoMeta,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'es_AR' },
      components: components || [],
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Meta API error: ${JSON.stringify(data)}`);
  }

  return data;
}

// ─── Función principal de envío ──────────────────────────────
async function enviarWhatsApp({ clienteId, telefono, tipo, nombre, local = 'mujer', extra = {} }) {
  const mock = process.env.WHATSAPP_MOCK !== 'false';
  const telefonoNorm = normalizarTelefono(telefono);

  // Determinar qué plantilla usar y sus parámetros
  let templateName;
  let components;
  let mensajeLog; // solo para el log en base de datos

  if (tipo === 'bienvenida' || tipo === 'bienvenida_mujer' || tipo === 'bienvenida_hombre') {
    // Plantilla: bienvenida_cliente → variable {{1}} = nombre
    templateName = 'bienvenida_cliente';
    components = [
      {
        type: 'body',
        parameters: [{ type: 'text', text: nombre }],
      },
    ];
    mensajeLog = `[plantilla: bienvenida_cliente] nombre=${nombre}`;

  } else if (tipo === 'cumpleanos') {
    // Plantilla: cumpleanos_cliente → variable {{1}} = nombre
    templateName = 'cumpleanos_cliente';
    components = [
      {
        type: 'body',
        parameters: [{ type: 'text', text: nombre }],
      },
    ];
    mensajeLog = `[plantilla: cumpleanos_cliente] nombre=${nombre}`;

  } else if (tipo === 'puntos') {
    // Plantilla: puntos_cliente → {{1}}=nombre, {{2}}=puntos nuevos, {{3}}=total
    const puntosNuevos = String(extra.puntosNuevos || extra.puntos || '0');
    const puntosTotal  = String(extra.puntos || '0');
    templateName = 'puntos_cliente';
    components = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombre },
          { type: 'text', text: puntosNuevos },
          { type: 'text', text: puntosTotal },
        ],
      },
    ];
    mensajeLog = `[plantilla: puntos_cliente] nombre=${nombre} puntosNuevos=${puntosNuevos} total=${puntosTotal}`;

  } else if (tipo === 'campaña' || tipo === 'campana') {
    // Plantilla: campana_cliente → {{1}}=nombre, {{2}}=mensaje de campaña
    const mensajeCampana = extra.mensajePersonalizado || '';
    templateName = 'campana_cliente';
    components = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombre },
          { type: 'text', text: mensajeCampana },
        ],
      },
    ];
    mensajeLog = `[plantilla: campana_cliente] nombre=${nombre} mensaje=${mensajeCampana}`;

  } else {
    // Tipo desconocido → usar bienvenida por defecto
    templateName = 'bienvenida_cliente';
    components = [
      {
        type: 'body',
        parameters: [{ type: 'text', text: nombre }],
      },
    ];
    mensajeLog = `[plantilla: bienvenida_cliente (fallback)] nombre=${nombre}`;
  }

  let estado = 'simulado';
  let metaMessageId = null;

  if (!mock) {
    try {
      const data = await enviarPorMetaTemplate(telefonoNorm, templateName, components);
      metaMessageId = data?.messages?.[0]?.id || null;
      estado = 'enviado';
      console.log(`[WhatsApp META][${local}] → ${telefonoNorm} | plantilla: ${templateName} | ID: ${metaMessageId}`);
    } catch (err) {
      estado = 'fallido';
      console.error(`[WhatsApp META ERROR][${local}] → ${telefonoNorm}:`, err.message);
    }
  } else {
    console.log(`[WhatsApp MOCK][local: ${local}] → ${telefonoNorm}`);
    console.log(`  Tipo:      ${tipo}`);
    console.log(`  Plantilla: ${templateName}`);
    console.log(`  Log:       ${mensajeLog}`);
  }

  // Guardar log en base de datos
  try {
    await pool.query(
      `INSERT INTO mensajes_whatsapp (cliente_id, telefono, tipo, mensaje, estado, twilio_sid, local_origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [clienteId || null, telefonoNorm, tipo, mensajeLog, estado, metaMessageId, local]
    );
  } catch (dbErr) {
    console.error('[WhatsApp] Error al guardar log:', dbErr.message);
  }

  return { estado, mensaje: mensajeLog };
}

// ─── Envío masivo a un segmento ──────────────────────────────
async function enviarCampana({ campanaId, nombre, mensaje, segmento, local = 'todos' }) {
  const where = [];
  const params = [];
  let idx = 1;

  // Filtro por segmento
  if (segmento === 'vip')            { where.push(`(segmento = $${idx} OR es_vip = 1)`); params.push('vip'); idx++; }
  else if (segmento === 'inactivos') { where.push(`segmento = $${idx}`); params.push('inactivo'); idx++; }
  else if (segmento !== 'todos')     { where.push(`segmento = $${idx}`); params.push(segmento); idx++; }

  // Filtro por local
  if (local === 'mujer')       { where.push(`local = $${idx}`); params.push('mujer'); idx++; }
  else if (local === 'hombre') { where.push(`local = $${idx}`); params.push('hombre'); idx++; }
  // 'todos' → no agrega filtro

  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const { rows: clientes } = await pool.query(
    `SELECT id, nombre, telefono, local FROM clientes ${whereSQL}`, params
  );

  let enviados = 0;
  for (const cliente of clientes) {
    await enviarWhatsApp({
      clienteId: cliente.id,
      telefono:  cliente.telefono,
      tipo:      'campaña',
      nombre:    cliente.nombre,
      local:     cliente.local || 'mujer',
      extra:     { mensajePersonalizado: mensaje },
    });
    enviados++;
    await new Promise(r => setTimeout(r, 300));
  }

  if (campanaId) {
    await pool.query(
      `UPDATE campanas SET estado='enviada', total_enviados=$1, enviado_en=NOW() WHERE id=$2`,
      [enviados, campanaId]
    );
  }

  return { enviados };
}

module.exports = { enviarWhatsApp, enviarCampana, normalizarTelefono };
