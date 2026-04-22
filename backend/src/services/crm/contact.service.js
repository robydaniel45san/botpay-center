const { Contact, Conversation, BotSession, Message } = require('../../models/index');
const logger = require('../../config/logger');

/**
 * Busca un contacto por número de teléfono.
 * Si no existe, lo crea con los datos básicos disponibles.
 */
const findOrCreateContact = async ({ phone, name, waId }) => {
  const [contact, created] = await Contact.findOrCreate({
    where: { phone },
    defaults: {
      phone,
      wa_id: waId || phone,
      name: name || null,
      last_seen_at: new Date(),
    },
  });

  if (!created) {
    // Actualizar nombre y última vez visto si hay datos nuevos
    const updates = { last_seen_at: new Date() };
    if (name && !contact.name) updates.name = name;
    if (waId && !contact.wa_id) updates.wa_id = waId;
    await contact.update(updates);
  } else {
    logger.info(`Nuevo contacto creado: ${phone}`);
  }

  return contact;
};

/**
 * Obtiene o crea la conversación activa de un contacto.
 * Si la última conversación está resuelta/expirada, abre una nueva.
 */
const getOrCreateConversation = async (contactId) => {
  // Buscar conversación activa
  let conversation = await Conversation.findOne({
    where: {
      contact_id: contactId,
      status: ['bot', 'open', 'pending'],
    },
    order: [['created_at', 'DESC']],
  });

  if (!conversation) {
    conversation = await Conversation.create({
      contact_id: contactId,
      status: 'bot',
      bot_flow: null,
      bot_step: null,
      last_message_at: new Date(),
    });

    // Crear sesión del bot vinculada
    await BotSession.create({
      conversation_id: conversation.id,
      contact_id: contactId,
      current_flow: null,
      current_step: null,
      context: {},
      is_active: true,
      last_interaction_at: new Date(),
    });

    logger.info(`Nueva conversación creada: ${conversation.id} para contacto ${contactId}`);
  }

  return conversation;
};

/**
 * Persiste un mensaje entrante (inbound) en la BD.
 */
const saveInboundMessage = async ({ conversationId, contactId, waMessageId, type, content, mediaId, metadata, timestamp }) => {
  return Message.create({
    conversation_id: conversationId,
    direction: 'inbound',
    sender_type: 'contact',
    sender_id: String(contactId),
    type: type || 'text',
    content,
    media_id: mediaId || null,
    wa_message_id: waMessageId,
    status: 'delivered',
    metadata: metadata || null,
    sent_at: timestamp || new Date(),
  });
};

/**
 * Persiste un mensaje saliente (outbound) del bot o agente.
 */
const saveOutboundMessage = async ({ conversationId, senderType = 'bot', senderId = 'bot', waMessageId, type = 'text', content, metadata }) => {
  return Message.create({
    conversation_id: conversationId,
    direction: 'outbound',
    sender_type: senderType,
    sender_id: String(senderId),
    type,
    content,
    wa_message_id: waMessageId || null,
    status: 'sent',
    metadata: metadata || null,
    sent_at: new Date(),
  });
};

/**
 * Actualiza el preview del último mensaje en la conversación.
 */
const updateConversationLastMessage = async (conversationId, preview) => {
  await Conversation.update(
    {
      last_message_at: new Date(),
      last_message_preview: preview?.substring(0, 200) || '',
    },
    { where: { id: conversationId } }
  );
};

/**
 * Actualiza el status de un mensaje por wa_message_id.
 */
const updateMessageStatus = async (waMessageId, status) => {
  await Message.update({ status }, { where: { wa_message_id: waMessageId } });
};

module.exports = {
  findOrCreateContact,
  getOrCreateConversation,
  saveInboundMessage,
  saveOutboundMessage,
  updateConversationLastMessage,
  updateMessageStatus,
};
