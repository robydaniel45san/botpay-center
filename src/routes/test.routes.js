const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { Contact, Conversation, Message } = require('../models/index');

const router = Router();

/**
 * POST /api/test/conversation
 * Crea un contacto y una conversación de prueba con un mensaje inicial.
 * Solo disponible en desarrollo.
 */
router.post('/conversation', async (req, res, next) => {
  try {
    const { name = 'Cliente Test', phone } = req.body;
    const testPhone = phone || `+591700${Date.now().toString().slice(-5)}`;

    const [contact] = await Contact.findOrCreate({
      where: { phone: testPhone },
      defaults: { name, phone: testPhone, status: 'active', opt_in: true },
    });

    const [conversation, created] = await Conversation.findOrCreate({
      where: { contact_id: contact.id, status: 'bot' },
      defaults: {
        id: uuidv4(),
        contact_id: contact.id,
        status: 'bot',
        channel: 'whatsapp',
        last_message_at: new Date(),
        last_message_preview: 'Conversación de prueba',
      },
    });

    if (created) {
      await Message.create({
        id: uuidv4(),
        conversation_id: conversation.id,
        direction: 'inbound',
        sender_type: 'contact',
        sender_id: String(contact.id),
        type: 'text',
        content: 'Hola, quiero realizar un pago',
        status: 'delivered',
        sent_at: new Date(),
      });
    }

    res.json({
      success: true,
      data: { contact, conversation, created },
    });
  } catch (err) { next(err); }
});

module.exports = router;
