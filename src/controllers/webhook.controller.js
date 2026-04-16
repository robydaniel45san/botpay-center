const { handleWebhook, handleVerification } = require('../services/whatsapp/webhook.handler');
const contactService = require('../services/crm/contact.service');
const botEngine = require('../services/bot/bot.engine');
const logger = require('../config/logger');

/**
 * Extrae texto legible de un mensaje normalizado para el preview.
 */
const getMessagePreview = (msg) => {
  if (msg.text) return msg.text;
  if (msg.interactive?.reply) return msg.interactive.reply.title;
  if (msg.type === 'image') return '📷 Imagen';
  if (msg.type === 'audio') return '🎵 Audio';
  if (msg.type === 'video') return '🎬 Video';
  if (msg.type === 'document') return '📄 Documento';
  if (msg.type === 'location') return '📍 Ubicación';
  if (msg.type === 'sticker') return '🔖 Sticker';
  return msg.type;
};

/**
 * Procesa un mensaje entrante normalizado:
 * 1. Busca o crea el contacto
 * 2. Obtiene o crea la conversación activa
 * 3. Persiste el mensaje
 * 4. Delega al bot engine (se integra en Fase 3)
 * 5. Emite evento Socket.io al CRM
 */
const processInboundMessage = async (msg, io) => {
  // 1. Contacto
  const contact = await contactService.findOrCreateContact({
    phone: msg.from,
    name: msg.contactName,
    waId: msg.from,
  });

  // 2. Conversación activa
  const conversation = await contactService.getOrCreateConversation(contact.id);

  // 3. Persistir mensaje
  const preview = getMessagePreview(msg);
  const savedMessage = await contactService.saveInboundMessage({
    conversationId: conversation.id,
    contactId: contact.id,
    waMessageId: msg.waMessageId,
    type: msg.type,
    content: msg.text || (msg.interactive?.reply ? JSON.stringify(msg.interactive.reply) : null),
    mediaId: msg.media?.id || null,
    metadata: msg.interactive || msg.media || msg.location || null,
    timestamp: msg.timestamp,
  });

  // 4. Actualizar preview de conversación
  await contactService.updateConversationLastMessage(conversation.id, preview);

  // 5. Emitir al CRM en tiempo real
  if (io) {
    io.to(`conversation:${conversation.id}`).emit('new_message', {
      conversationId: conversation.id,
      message: {
        id: savedMessage.id,
        direction: 'inbound',
        type: msg.type,
        content: savedMessage.content,
        preview,
        sentAt: savedMessage.sent_at,
      },
      contact: { id: contact.id, name: contact.name, phone: contact.phone },
    });

    // Notificar a la bandeja de entrada general
    io.emit('inbox_update', {
      conversationId: conversation.id,
      preview,
      lastMessageAt: new Date(),
      contactName: contact.name || contact.phone,
    });
  }

  // 6. Delegar al bot engine si la conversación está en modo bot
  if (!conversation.bot_paused && conversation.status === 'bot') {
    await botEngine.process({ msg, contact, conversation });
  }

  // 7. Si hay agente asignado, emitir evento para que el agente vea el mensaje
  if (conversation.agent_id && io) {
    io.to(`agent:${conversation.agent_id}`).emit('new_message', {
      conversationId: conversation.id,
      contactName: contact.name || contact.phone,
      preview,
    });
  }

  logger.info(`Mensaje procesado: ${msg.waMessageId} de ${msg.from}`);
  return { contact, conversation, message: savedMessage };
};

/**
 * Procesa una actualización de estado (sent/delivered/read/failed).
 */
const processStatusUpdate = async (update) => {
  await contactService.updateMessageStatus(update.waMessageId, update.status);
  logger.debug(`Status actualizado: ${update.waMessageId} → ${update.status}`);
};

// ── Controladores Express ─────────────────────────────

const verifyWebhook = (req, res) => {
  handleVerification(req, res);
};

const receiveWebhook = async (req, res) => {
  const io = req.app.get('io');

  await handleWebhook(req, res, {
    onMessage: (msg) => processInboundMessage(msg, io),
    onStatusUpdate: processStatusUpdate,
  });
};

module.exports = { verifyWebhook, receiveWebhook };
