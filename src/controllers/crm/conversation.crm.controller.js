const { Op } = require('sequelize');
const { Conversation, Contact, Agent, Message, BotSession } = require('../../models/index');
const { AppError } = require('../../middleware/errorHandler');
const whatsapp = require('../../services/whatsapp/whatsapp.service');
const contactService = require('../../services/crm/contact.service');

// ── Bandeja de entrada ────────────────────────────────
const inbox = async (req, res, next) => {
  try {
    const { status, agentId, page = 1, limit = 25, search } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    else where.status = { [Op.in]: ['bot', 'open', 'pending'] };
    if (agentId) where.agent_id = agentId;

    const contactWhere = {};
    if (search) {
      contactWhere[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Conversation.findAndCountAll({
      where,
      include: [
        { model: Contact, as: 'contact', attributes: ['id', 'name', 'phone', 'avatar_url'], where: Object.keys(contactWhere).length ? contactWhere : undefined },
        { model: Agent, as: 'agent', attributes: ['id', 'name', 'avatar_url'], required: false },
      ],
      order: [['last_message_at', 'DESC NULLS LAST']],
      limit: parseInt(limit), offset: parseInt(offset),
      distinct: true,
    });

    res.json({ success: true, data: rows, meta: { total: count, page: +page, limit: +limit } });
  } catch (err) { next(err); }
};

// ── Detalle de conversación con mensajes ──────────────
const getById = async (req, res, next) => {
  try {
    const conversation = await Conversation.findByPk(req.params.id, {
      include: [
        { model: Contact, as: 'contact', attributes: { exclude: [] } },
        { model: Agent, as: 'agent', attributes: ['id', 'name', 'avatar_url'], required: false },
      ],
    });
    if (!conversation) throw new AppError('Conversación no encontrada', 404);

    const messages = await Message.findAll({
      where: { conversation_id: conversation.id },
      order: [['sent_at', 'ASC']],
      limit: 100,
    });

    // Resetear contador de no leídos
    await conversation.update({ unread_count: 0 });

    res.json({ success: true, data: { ...conversation.toJSON(), messages } });
  } catch (err) { next(err); }
};

// ── Asignar agente ────────────────────────────────────
const assign = async (req, res, next) => {
  try {
    const { agentId } = req.body;
    const conversation = await Conversation.findByPk(req.params.id);
    if (!conversation) throw new AppError('Conversación no encontrada', 404);

    const agent = await Agent.findByPk(agentId);
    if (!agent) throw new AppError('Agente no encontrado', 404);

    await conversation.update({ agent_id: agentId, status: 'open', bot_paused: true });

    // Notificar en tiempo real
    const io = req.app.get('io');
    io?.to(`agent:${agentId}`).emit('conversation_assigned', { conversationId: conversation.id });

    res.json({ success: true, data: conversation });
  } catch (err) { next(err); }
};

// ── Cerrar/resolver conversación ──────────────────────
const close = async (req, res, next) => {
  try {
    const conversation = await Conversation.findByPk(req.params.id);
    if (!conversation) throw new AppError('Conversación no encontrada', 404);
    await conversation.update({ status: 'resolved', resolved_at: new Date() });

    const io = req.app.get('io');
    io?.emit('conversation_resolved', { conversationId: conversation.id });

    res.json({ success: true, data: conversation });
  } catch (err) { next(err); }
};

// ── Reactivar bot ─────────────────────────────────────
const resumeBot = async (req, res, next) => {
  try {
    const conversation = await Conversation.findByPk(req.params.id);
    if (!conversation) throw new AppError('Conversación no encontrada', 404);
    await conversation.update({ status: 'bot', bot_paused: false, agent_id: null });
    await BotSession.update(
      { current_flow: null, current_step: null, context: {} },
      { where: { conversation_id: conversation.id } }
    );
    res.json({ success: true, message: 'Bot reactivado' });
  } catch (err) { next(err); }
};

// ── Enviar mensaje como agente ────────────────────────
const sendMessage = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) throw new AppError('Mensaje vacío', 400);

    const conversation = await Conversation.findByPk(req.params.id, {
      include: [{ model: Contact, as: 'contact', attributes: ['phone'] }],
    });
    if (!conversation) throw new AppError('Conversación no encontrada', 404);

    // Enviar por WhatsApp
    const waResult = await whatsapp.sendText(conversation.contact.phone, text.trim());

    // Persistir
    const message = await contactService.saveOutboundMessage({
      conversationId: conversation.id,
      senderType: 'agent',
      senderId: String(req.agent.id),
      waMessageId: waResult?.messages?.[0]?.id || null,
      type: 'text',
      content: text.trim(),
    });

    await contactService.updateConversationLastMessage(conversation.id, text.trim());

    // Emitir en tiempo real
    const io = req.app.get('io');
    io?.to(`conversation:${conversation.id}`).emit('new_message', {
      conversationId: conversation.id,
      message: { id: message.id, direction: 'outbound', senderType: 'agent', content: text, sentAt: message.sent_at },
    });

    res.status(201).json({ success: true, data: message });
  } catch (err) { next(err); }
};

module.exports = { inbox, getById, assign, close, resumeBot, sendMessage };
