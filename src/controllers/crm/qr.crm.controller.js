const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { Conversation, Contact, Message } = require('../../models/index');
const { AppError } = require('../../middleware/errorHandler');

/**
 * POST /api/crm/conversations/:id/qr
 * Genera un QR con el texto dado y lo inserta como mensaje en la conversación.
 */
const generateQR = async (req, res, next) => {
  try {
    const { text, label } = req.body;
    if (!text?.trim()) throw new AppError('El campo text es requerido', 400);

    const conversation = await Conversation.findByPk(req.params.id, {
      include: [{ model: Contact, as: 'contact', attributes: ['id', 'name', 'phone'] }],
    });
    if (!conversation) throw new AppError('Conversación no encontrada', 404);

    // Generar QR como base64
    const qrBase64 = await QRCode.toDataURL(text.trim(), {
      width: 300,
      margin: 2,
      color: { dark: '#1e293b', light: '#ffffff' },
    });

    // Guardar como mensaje tipo image en la conversación
    const message = await Message.create({
      id: uuidv4(),
      conversation_id: conversation.id,
      direction: 'outbound',
      sender_type: 'agent',
      sender_id: String(req.agent.id),
      type: 'image',
      content: label || `QR: ${text.trim()}`,
      metadata: { qr_base64: qrBase64, qr_text: text.trim() },
      status: 'sent',
      sent_at: new Date(),
    });

    // Actualizar preview de la conversación
    await conversation.update({
      last_message_at: new Date(),
      last_message_preview: `[QR] ${label || text.trim()}`,
    });

    // Emitir en tiempo real
    const io = req.app.get('io');
    io?.to(`conversation:${conversation.id}`).emit('new_message', {
      conversationId: conversation.id,
      message: message.toJSON(),
    });

    res.status(201).json({ success: true, data: message });
  } catch (err) { next(err); }
};

module.exports = { generateQR };
