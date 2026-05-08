/**
 * Servicio WhatsApp — Casa Sierra
 * WHATSAPP_MOCK=true  → simula envío (logs en consola)
 * WHATSAPP_MOCK=false → envía real por Meta Cloud API
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

// ─── Plantillas de mensajes ──────────────────────────────────
const TEMPLATES = {
  post_compra: (nombre) =>
    `Hola ${nombre} 💖 ¡Gracias por tu compra en Casa Sierra! Te va a encantar cómo te queda. Cualquier consulta estamos acá. ✨`,

  cross_sell: (nombre) =>
    `Hola ${nombre} 👀 Te guardé algo que combina perfecto con lo que llevaste. ¿Querés que te lo muestre? Escribinos y te cuento.`,

  reactivacion: (nombre) =>
    `Hola ${nombre} 🌟 Hace tiempo que no venís por acá... ¡Te queremos mostrar lo nuevo! Tenemos piezas que creo que te van a enamorar. ¿Pasás a verlas?`,

  vip: (nombre) =>
    `${nombre}, tenés acceso anticipado a nuestra nueva colección ✨ Solo para clientes VIP como vos. ¿Querés verla antes que nadie?`,

  bienvenida_mujer: (nombre) =>
    `¡Bienvenida ${nombre}! 🎉 Ya sos parte de la comunidad Casa Sierra Mujer. A partir de ahora vas a recibir novedades, preventas y beneficios exclusivos. ¡Gracias por elegirnos! 💛`,

  bienvenida_hombre: (nombre) =>
    `¡Hola ${nombre}! 🎉 Ya sos parte de la comunidad Casa Sierra. A partir de ahora vas a recibir novedades, preventas y beneficios exclusivos. ¡Gracias por elegirnos! 💪`,

  // alias genérico (por compatibilidad con código existente)
  bienvenida: (nombre) =>
    `¡Bienvenida ${nombre}! 🎉 Ya sos parte de la comunidad Casa Sierra. A partir de ahora vas a recibir beneficios exclusivos, preventas y mucho más. ¡Gracias por elegirnos! 💛`,

  puntos: (nombre, puntos, nivel) =>
    `Hola ${nombre} ⭐ Ya tenés ${puntos} puntos acumulados. Nivel: ${nivel ? nivel.toUpperCase() : 'BRONCE'}. ¡Seguí comprando para subir y desbloquear más beneficios!`,

  personal_shopper: (nombre) =>
    `Hola ${nombre} 👗 Tu personal shopper está disponible. Contanos tu ocasión, talle y estilo, y te armamos un look a medida. ¡Es gratis para nuestros clientes!`,

  cumpleanos: (nombre) =>
    `¡Feliz cumpleaños ${nombre}! 🎂🎉 Toda la familia de Casa Sierra te desea un día increíble. Como regalo especial, tenés un descuento esperándote en el local. ¡Vení a celebrar con nosotros! 🎁`,
};

// ─── Envío real por Meta Cloud API ──────────────────────────
async function enviarPorMeta(telefonoNorm, mensaje) {
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
    type: 'text',
    text: { body: mensaje },
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

  // Construir mensaje
  let mensaje;
  if (extra.mensajePersonalizado) {
    mensaje = extra.mensajePersonalizado;
  } else {
    const tipoConLocal = `${tipo}_${local}`;
    if (TEMPLATES[tipoConLocal]) {
      mensaje = TEMPLATES[tipoConLocal](nombre, extra.puntos, extra.nivel);
    } else if (TEMPLATES[tipo]) {
      mensaje = TEMPLATES[tipo](nombre, extra.puntos, extra.nivel);
    } else {
      mensaje = TEMPLATES['bienvenida'](nombre, extra.puntos, extra.nivel);
    }
  }

  let estado = 'simulado';
  let metaMessageId = null;

  if (!mock) {
    try {
      const data = await enviarPorMeta(telefonoNorm, mensaje);
      metaMessageId = data?.messages?.[0]?.id || null;
      estado = 'enviado';
      console.log(`[WhatsApp META][${local}] → ${telefonoNorm} | ${tipo} | ID: ${metaMessageId}`);
    } catch (err) {
      estado = 'fallido';
      console.error(`[WhatsApp META ERROR][${local}] → ${telefonoNorm}:`, err.message);
    }
  } else {
    console.log(`[WhatsApp MOCK][local: ${local}] → ${telefonoNorm}`);
    console.log(`  Tipo:  ${tipo}`);
    console.log(`  Msg:   ${mensaje}`);
  }

  // Guardar log en base de datos
  try {
    await pool.query(
      `INSERT INTO mensajes_whatsapp (cliente_id, telefono, tipo, mensaje, estado, twilio_sid, local_origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [clienteId || null, telefonoNorm, tipo, mensaje, estado, metaMessageId, local]
    );
  } catch (dbErr) {
    console.error('[WhatsApp] Error al guardar log:', dbErr.message);
  }

  return { estado, mensaje };
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

module.exports = { enviarWhatsApp, enviarCampana, TEMPLATES, normalizarTelefono };
