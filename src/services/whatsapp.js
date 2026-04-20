/**
 * Servicio WhatsApp — Casa Sierra
 * WHATSAPP_MOCK=true  → simula envío (logs en consola)
 * WHATSAPP_MOCK=false → envía real por Twilio
 *
 * Cada local tiene su propio número de Twilio:
 *   TWILIO_WHATSAPP_FROM_MUJER  → número del local Mujer
 *   TWILIO_WHATSAPP_FROM_HOMBRE → número del local Hombre
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

// ─── Seleccionar número de origen según local ────────────────
function obtenerNumeroOrigen(local) {
  if (local === 'hombre') {
    return process.env.TWILIO_WHATSAPP_FROM_HOMBRE
        || process.env.TWILIO_WHATSAPP_FROM
        || 'whatsapp:+14155238886';
  }
  // mujer (default)
  return process.env.TWILIO_WHATSAPP_FROM_MUJER
      || process.env.TWILIO_WHATSAPP_FROM
      || 'whatsapp:+14155238886';
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

// ─── Función principal de envío ──────────────────────────────
async function enviarWhatsApp({ clienteId, telefono, tipo, nombre, local = 'mujer', extra = {} }) {
  const mock = process.env.WHATSAPP_MOCK !== 'false';
  const telefonoNorm = normalizarTelefono(telefono);

  // Usar plantilla específica de local si existe, sino la genérica
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
      mensaje = TEMPLATES['bienvenida'](nombre, extra.puntos, extra.nivel);(`Tipo de mensaje desconocido: ${tipo}`);
    }
  }

  const from = obtenerNumeroOrigen(local);
  let estado = 'simulado';
  let twilioSid = null;

  if (!mock) {
    try {
      const twilio = require('twilio')(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      const response = await twilio.messages.create({
        body: mensaje,
        from: from,
        to: `whatsapp:${telefonoNorm}`,
      });
      twilioSid = response.sid;
      estado = 'enviado';
      console.log(`[WhatsApp REAL][${local}] → ${telefonoNorm} | ${tipo} | SID: ${twilioSid}`);
    } catch (err) {
      estado = 'fallido';
      console.error(`[WhatsApp ERROR][${local}] → ${telefonoNorm}:`, err.message);
    }
  } else {
    console.log(`[WhatsApp MOCK][local: ${local}] → ${telefonoNorm}`);
    console.log(`  Desde: ${from}`);
    console.log(`  Tipo:  ${tipo}`);
    console.log(`  Msg:   ${mensaje}`);
  }

  try {
    await pool.query(
      `INSERT INTO mensajes_whatsapp (cliente_id, telefono, tipo, mensaje, estado, twilio_sid, local_origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [clienteId || null, telefonoNorm, tipo, mensaje, estado, twilioSid, local]
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
  if (local === 'mujer')   { where.push(`local = $${idx}`); params.push('mujer'); idx++; }
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
      `UPDATE campanas SET estado='enviada', total_enviados=$1, enviado_en=datetime('now') WHERE id=$2`,
      [enviados, campanaId]
    );
  }

  return { enviados };
}

module.exports = { enviarWhatsApp, enviarCampana, TEMPLATES, normalizarTelefono };
