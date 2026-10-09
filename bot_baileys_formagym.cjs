/**
 * ============================================================================
 * FORMAGYM — BOT WHATSAPP 24/7 CON BAILEYS LOCAL (VERSIÓN CORREGIDA ANTI-HTML)
 * ============================================================================
 * NOTA IMPORTANTE:
 * Si usas el ejecutable de Doble Clic (CLIC_AQUI_INICIAR_WINDOWS.bat o
 * CLIC_AQUI_INICIAR_MAC.command), ¡NO necesitas abrir este archivo aparte!
 * El ejecutable de doble clic ya activa automáticamente el Servidor Web +
 * Baileys Local integrado + PM2 24/7 en un solo proceso sin errores.
 *
 * Este archivo independiente está corregido para que:
 * 1. Conecte primero a tu servidor local (http://localhost:3000) evitando el
 *    error: Unexpected token '<', "<!doctype "... is not valid JSON
 * 2. Extraiga el número real cuando WhatsApp envía IDs internos (@lid) como
 *    +112974886883436@lid usando senderPn / participantAlt.
 * 3. Tenga respuestas inteligentes de respaldo si el servidor web está apagado.
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const LOCAL_API_URL = process.env.FORMAGYM_API_URL || 'http://localhost:3000';

// Extrae el número real incluso cuando WhatsApp envía @lid (+112974886883436)
function extraerTelefonoReal(msg) {
  const key = msg.key || {};
  const posiblesJids = [
    key.senderPn,
    key.participantAlt,
    key.participant,
    key.remoteJidAlt,
    key.remoteJid,
  ].filter(Boolean);

  for (const candidato of posiblesJids) {
    if (String(candidato).endsWith('@s.whatsapp.net')) {
      const limpio = String(candidato).replace('@s.whatsapp.net', '').split(':')[0].replace(/\D/g, '');
      if (limpio) return '+' + limpio;
    }
  }

  const raw = String(key.remoteJid || '')
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .split(':')[0]
    .replace(/\D/g, '');
  return raw ? '+' + raw : '+0000000000';
}

function respuestaLocalRespaldo(texto) {
  const limpio = String(texto || '').trim().toLowerCase();
  if (/^(hola|ola|buenas|buenos dias|buenas tardes|buenas noches|menu|menú|inicio|info)$/i.test(limpio)) {
    return (
      '🏋️‍♂️ *¡Hola! Bienvenido a FormaGym.*\n\n' +
      'Escribe el número o nombre de lo que deseas consultar:\n' +
      '1️⃣ *Planes y Membresías* (Inscripción + Mensualidad)\n' +
      '2️⃣ *Tienda de Suplementos y Agua*\n' +
      '3️⃣ *Reportar Pago de Ropa (Catálogo Abierto)*\n' +
      '4️⃣ *Reportar Pago Móvil / Zelle / Efectivo*\n' +
      '5️⃣ *Hablar con un Administrador*'
    );
  }
  return (
    '🏋️‍♂️ *Asistente FormaGym*\n\n' +
    'Hemos recibido tu mensaje: _"' + texto + '"_.\n' +
    '⚠️ *Nota técnica:* El servidor local en `http://localhost:3000` aún no está encendido. ' +
    'Haz doble clic en `CLIC_AQUI_INICIAR_WINDOWS.bat` para encender el sistema completo con PM2 y Baileys integrado.'
  );
}

async function iniciarBotFormaGym() {
  console.log('====================================================');
  console.log('🚀 Iniciando Bot WhatsApp 24/7 para FormaGym...');
  console.log('🔗 Conectado al motor local:', LOCAL_API_URL);
  console.log('====================================================');

  const { state, saveCreds } = await useMultiFileAuthState('./sesion_whatsapp_formagym');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['FormaGym 24/7 Server', 'Chrome', '120.0.0'],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 ESCANEA ESTE CÓDIGO QR CON EL WHATSAPP DEL GIMNASIO:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const debeReconectar = statusCode !== DisconnectReason.loggedOut;
      console.log('⚠️ Conexión cerrada. ¿Reconectar automáticamente?:', debeReconectar);
      if (debeReconectar) {
        setTimeout(() => iniciarBotFormaGym(), 4000);
      } else {
        console.log('❌ Sesión cerrada desde el teléfono. Borra la carpeta sesion_whatsapp_formagym para volver a vincular.');
      }
    } else if (connection === 'open') {
      console.log('✅ ¡CONECTADO EXITOSAMENTE! El Bot de FormaGym está activo 24/7.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us') || jid.endsWith('@newsletter')) continue;

      const texto =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';

      if (!texto.trim()) continue;

      const telefonoCliente = extraerTelefonoReal(msg);
      const nombreCliente = msg.pushName || 'Cliente WhatsApp';

      console.log(`📩 Mensaje de ${telefonoCliente} (${nombreCliente}): ${texto}`);

      try {
        await sock.sendPresenceUpdate('composing', jid);

        const res = await fetch(`${LOCAL_API_URL}/api/whatsapp/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            phone: telefonoCliente,
            name: nombreCliente,
            message: texto,
          }),
        });

        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          const rawPreview = await res.text();
          console.warn(
            `⚠️ El servidor devolvió contenido no-JSON (${res.status}). Usando respuesta local segura. Fragmento:`,
            rawPreview.slice(0, 80)
          );
          await sock.sendMessage(jid, { text: respuestaLocalRespaldo(texto) });
          continue;
        }

        const data = await res.json();

        if (data && data.reply && !data.silenced) {
          await sock.sendMessage(jid, { text: data.reply });
        }

        if (data && Array.isArray(data.adminNotifications)) {
          for (const notif of data.adminNotifications) {
            if (notif.adminPhone && notif.message) {
              const adminJid = notif.adminPhone.replace(/\D/g, '') + '@s.whatsapp.net';
              await sock.sendMessage(adminJid, { text: notif.message });
            }
          }
        }
      } catch (err) {
        console.error('Error conectando con localhost:3000:', err.message);
        await sock.sendMessage(jid, { text: respuestaLocalRespaldo(texto) });
      }
    }
  });
}

iniciarBotFormaGym();
