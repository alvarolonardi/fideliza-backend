/**
 * Servicio WhatsApp — Casa Sierra
 * WHATSAPP_MOCK=true  → simula envío (logs en consola)
 * WHATSAPP_MOCK=false → envía real por Meta Cloud API usando plantillas aprobadas
 */

const pool = require('../../config/db');

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

async function enviarPorMetaTemplate(telefonoNorm, templateName, components) {
  const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const accessToken   = process.env.META_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) throw new Error('Faltan variables META_PHONE_NUMBER_ID o META_ACCESS_TOKEN en Railway');
  const telefonoMeta = telefonoNorm.replace('+', '');
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefonoMeta,
    type: 'template',
    template: { name: templateName, language: { code: 'es_AR' }, components: components || [] },
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Meta API error: ${JSON.stringify(data)}`);
  return data;
}

async function enviarWhatsApp({ clienteId, telefono, tipo, nombre, local = 'mujer', extra = {} }) {
  const mock = process.env.WHATSAPP_MOCK !== 'false';
  const telefonoNorm = normalizarTelefono(telefono);

  let templateName;
  let components;
  let mensajeLog;

  if (tipo === 'bienvenida' || tipo === 'bienvenida_mujer' || tipo === 'bienvenida_hombre') {
    templateName = 'bienvenida_fideliza';
    components = [{ type: 'body', parameters: [{ type: 'text', text: nombre }] }];
    mensajeLog = `[plantilla: bienvenida_fideliza] nombre=${nombre}`;

  } else if (tipo === 'cumpleanos') {
    templateName = 'cumpleanos_fideliza';
    components = [{ type: 'body', parameters: [{ type: 'text', text: nombre }] }];
    mensajeLog = `[plantilla: cumpleanos_fideliza] nombre=${nombre}`;

  } else if (tipo === 'puntos500') {
    templateName = 'puntos500_fideliza';
    components = [{ type: 'body', parameters: [{ type: 'text', text: nombre }] }];
    mensajeLog = `[plantilla: puntos500_fideliza] nombre=${nombre}`;

  } else if (tipo === 'puntos1000') {
    templateName = 'puntos1000_fideliza';
    components = [{ type: 'body', parameters: [{ type: 'text', text: nombre }] }];
    mensajeLog = `[plantilla: puntos1000_fideliza] nombre=${nombre}`;

  } else if (tipo === 'campaña' || tipo === 'campana') {
    const mensajeCampana = extra.mensajePersonalizado || '';
    templateName = 'campana_fideliza';
    components = [{ type: 'body', parameters: [{ type: 'text', text: nombre }, { type: 'text', text: mensajeCampana }] }];
    mensajeLog = `[plantilla: campana_fideliza] nombre=${nombre} mensaje=${mensajeCampana}`;

  } else if (tipo === 'post_compra') {
    templateName = 'campana_fideliza';
    const msg = '¡Gracias por tu compra! Esperamos que lo disfrutes 🛍️';
    components = [{ type: 'body', parameters: [{ type: 'text', text: nombre }, { type: 'text', text: msg }] }];
    mensajeLog = `[plantilla: campana_fideliza / post_compra] nombre=${nombre}`;

  } else if (tipo === 'cross_sell') {
    templateName = 'campana_fideliza';
    const msg = 'Tenemos novedades que te van a encantar. ¡Pasá a visitarnos!';
    components = [{ type: 'body', parameters: [{ type: 'text', text: nombre }, { type: 'text', text: msg }] }];
    mensajeLog = `[plantilla: campana_fideliza / cross_sell] nombre=${nombre}`;

  } else if (tipo === 'reactivacion') {
    templateName = 'campana_fideliza';
    const msg = '¡Te extrañamos! Hace tiempo que no te vemos por Casa Sierra 🌟';
    components = [{ type: 'body', parameters: [{ type: 'text', text: nombre }, { type: 'text', text: msg }] }];
    mensajeLog = `[plantilla: campana_fideliza / reactivacion] nombre=${nombre}`;

  } else if (tipo === 'vip') {
    templateName = 'campana_fideliza';
    const msg = 'Como cliente VIP tenés acceso a ofertas exclusivas esta semana ✨';
    components = [{ type: 'body', parameters: [{ type: 'text', text: nombre }, { type: 'text', text: msg }] }];
    mensajeLog = `[plantilla: campana_fideliza / vip] nombre=${nombre}`;

  } else if (tipo === 'personal_shopper') {
    templateName = 'campana_fideliza';
    const msg = 'Tu personal shopper de Casa Sierra está disponible para ayudarte 👗';
    components = [{ type: 'body', parameters: [{ type: 'text', text: nombre }, { type: 'text', text: msg }] }];
    mensajeLog = `[plantilla: campana_fideliza / personal_shopper] nombre=${nombre}`;

  } else {
    templateName = 'bienvenida_fideliza';
    components = [{ type: 'body', parameters: [{ type: 'text', text: nombre }] }];
    mensajeLog = `[plantilla: bienvenida_fideliza (fallback)] nombre=${nombre}`;
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

async function enviarCampana({ campanaId, nombre, mensaje, segmento, local = 'todos' }) {
  const where = [];
  const params = [];
  let idx = 1;
  if (segmento === 'vip')            { where.push(`(segmento = $${idx} OR es_vip = 1)`); params.push('vip'); idx++; }
  else if (segmento === 'inactivos') { where.push(`segmento = $${idx}`); params.push('inactivo'); idx++; }
  else if (segmento !== 'todos')     { where.push(`segmento = $${idx}`); params.push(segmento); idx++; }
  if (local === 'mujer')       { where.push(`local = $${idx}`); params.push('mujer'); idx++; }
  else if (local === 'hombre') { where.push(`local = $${idx}`); params.push('hombre'); idx++; }
  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const { rows: clientes } = await pool.query(`SELECT id, nombre, telefono, local FROM clientes ${whereSQL}`, params);
  let enviados = 0;
  for (const cliente of clientes) {
    await enviarWhatsApp({ clienteId: cliente.id, telefono: cliente.telefono, tipo: 'campaña', nombre: cliente.nombre, local: cliente.local || 'mujer', extra: { mensajePersonalizado: mensaje } });
    enviados++;
    await new Promise(r => setTimeout(r, 300));
  }
  if (campanaId) {
    await pool.query(`UPDATE campanas SET estado='enviada', total_enviados=$1, enviado_en=NOW() WHERE id=$2`, [enviados, campanaId]);
  }
  return { enviados };
}

module.exports = { enviarWhatsApp, enviarCampana, normalizarTelefono };
