const crypto = require('crypto');
const logger = require('../../config/logger');
const whatsapp = require('./whatsapp.service');

/**
 * Verifica la firma HMAC-SHA256 que Meta envía en el header x-hub-signature-256.
 * Se llama antes de parsear el body JSON.
 */
const verifySignature = (rawBody, signature) => {
  if (!signature) return false;
  const expected = `sha256=${crypto
    .createHmac('sha256', process.env.META_APP_SECRET || '')
    .update(rawBody)
    .digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

/**
 * Extrae todos los mensajes entrantes de un payload de webhook de Meta.
 * Retorna un array normalizado de objetos de mensaje.
 */
const extractMessages = (body) => {
  const messages = [];

  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value?.messages) return messages;

  for (const msg of value.messages) {
    const contact = value.contacts?.find((c) => c.wa_id === msg.from);

    messages.push({
      waMessageId: msg.id,
      from: msg.from,                    // número del cliente
      contactName: contact?.profile?.name || null,
      timestamp: new Date(parseInt(msg.timestamp) * 1000),
      type: msg.type,
      // Contenido según tipo
      text: msg.text?.body || null,
      // Para interactivos (botones y listas)
      interactive: msg.interactive
        ? {
            type: msg.interactive.type,
            // button_reply o list_reply
            reply: msg.interactive.button_reply || msg.interactive.list_reply || null,
          }
        : null,
      // Media
      media: (['image', 'audio', 'video', 'document', 'sticker'].includes(msg.type))
        ? {
            id: msg[msg.type]?.id,
            mimeType: msg[msg.type]?.mime_type,
            sha256: msg[msg.type]?.sha256,
            caption: msg[msg.type]?.caption,
            filename: msg[msg.type]?.filename,
          }
        : null,
      // Ubicación
      location: msg.location || null,
      // Reacción
      reaction: msg.reaction || null,
      // Referencia al mensaje que responde
      context: msg.context || null,
    });
  }

  return messages;
};

/**
 * Extrae actualizaciones de estado (sent, delivered, read, failed).
 */
const extractStatusUpdates = (body) => {
  const updates = [];
  const value = body?.entry?.[0]?.changes?.[0]?.value;

  if (!value?.statuses) return updates;

  for (const s of value.statuses) {
    updates.push({
      waMessageId: s.id,
      recipientId: s.recipient_id,
      status: s.status,               // sent | delivered | read | failed
      timestamp: new Date(parseInt(s.timestamp) * 1000),
      error: s.errors?.[0] || null,
    });
  }

  return updates;
};

/**
 * Handler principal del webhook POST de Meta.
 * Delega a los procesadores de mensajes y status.
 */
const handleWebhook = async (req, res, { onMessage, onStatusUpdate } = {}) => {
  // Verificar firma
  const rawBody = req.body; // express.raw() → Buffer
  const signature = req.headers['x-hub-signature-256'];

  if (process.env.NODE_ENV === 'production') {
    if (!verifySignature(rawBody, signature)) {
      logger.warn('Webhook: firma inválida rechazada');
      return res.sendStatus(403);
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  // Meta espera 200 rápido — responder antes de procesar
  res.sendStatus(200);

  // Ignorar pings de verificación de Meta
  if (parsed.object !== 'whatsapp_business_account') return;

  // Procesar mensajes
  const messages = extractMessages(parsed);
  for (const msg of messages) {
    try {
      // Marcar como leído automáticamente
      await whatsapp.markAsRead(msg.waMessageId);

      if (onMessage) await onMessage(msg);
    } catch (err) {
      logger.error(`Error procesando mensaje ${msg.waMessageId}:`, err);
    }
  }

  // Procesar actualizaciones de estado
  const statusUpdates = extractStatusUpdates(parsed);
  for (const update of statusUpdates) {
    try {
      if (onStatusUpdate) await onStatusUpdate(update);
    } catch (err) {
      logger.error(`Error procesando status ${update.waMessageId}:`, err);
    }
  }
};

/**
 * Handler de verificación GET del webhook (handshake con Meta).
 */
const handleVerification = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    logger.info('Webhook Meta verificado exitosamente');
    return res.status(200).send(challenge);
  }

  logger.warn('Intento de verificación de webhook con token inválido');
  res.sendStatus(403);
};

module.exports = { handleWebhook, handleVerification, extractMessages, extractStatusUpdates };
