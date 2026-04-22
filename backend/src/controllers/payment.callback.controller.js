const { processPaymentNotification } = require('../services/paycenter/qr.service');
const botEngine = require('../services/bot/bot.engine');
const { Contact, Conversation, Appointment } = require('../models/index');
const logger = require('../config/logger');

/**
 * POST /api/paycenter/payment-callback
 *
 * PayCenterProject llama este endpoint cuando una transacción es confirmada.
 * El payload viene del central de PayCenter después de procesar
 * el callback del banco (adapter → central → aquí).
 *
 * Payload esperado:
 * {
 *   qrId:          UUID del QR en PayCenter (qr.id)
 *   transactionId: UUID de la transacción (transaction.id)
 *   orderId:       string de referencia
 *   amount:        number
 *   currencyCode:  'BOB'
 *   status:        'paid'
 *   payerName:     string | null
 *   payerBank:     string | null
 *   payerAccount:  string | null
 *   voucherId:     string | null  (bank_voucher_id)
 *   transactedAt:  ISO date string
 * }
 */
const handlePaymentCallback = async (req, res) => {
  // Responder 200 de inmediato para que PayCenter no reintente
  res.sendStatus(200);

  const {
    qrId,
    transactionId,
    orderId,
    amount,
    currencyCode,
    status,
    payerName,
    payerBank,
    voucherId,
  } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  // Solo procesar pagos confirmados
  if (status !== 'paid') {
    logger.debug(`Callback PayCenter ignorado — status=${status} qrId=${qrId}`);
    return;
  }

  logger.info(`Callback pago recibido: qrId=${qrId} orderId=${orderId} amount=${amount}`);

  try {
    // 1. Actualizar PaymentRequest en BotPay
    const paymentRequest = await processPaymentNotification({
      paycenterQrId: qrId,
      transactionId,
      payerName,
      payerBank,
      voucherId,
    });

    if (!paymentRequest) {
      logger.warn(`Callback para QR desconocido en BotPay: ${qrId}`);
      return;
    }

    // 2. Si hay cita vinculada al pago, marcarla como pagada/confirmada
    const appointment = await Appointment.findOne({
      where: { payment_request_id: paymentRequest.id },
    });

    if (appointment) {
      await appointment.update({ status: 'paid', confirmed_at: new Date() });
      logger.info(`Cita ${appointment.id} marcada como pagada`);
    }

    // 3. Obtener contacto para enviar notificación WhatsApp
    const contact = await Contact.findByPk(paymentRequest.contact_id);
    if (!contact) return;

    // 4. Notificar al cliente por WhatsApp
    await botEngine.notifyPaymentReceived({
      phone: contact.phone,
      paymentRequest,
    });

    // 5. Emitir evento Socket.io al CRM para que los agentes vean el pago en tiempo real
    const io = global._io; // referencia global seteada en server.js
    if (io && paymentRequest.conversation_id) {
      const conversation = await Conversation.findByPk(paymentRequest.conversation_id);

      io.emit('payment_received', {
        paymentRequestId: paymentRequest.id,
        conversationId: paymentRequest.conversation_id,
        contactName: contact.name || contact.phone,
        amount: paymentRequest.amount,
        currency: paymentRequest.currency_code,
        orderId: paymentRequest.paycenter_order_id,
        payerName,
        paidAt: paymentRequest.paid_at,
      });

      // Si la conversación existe, actualizarla
      if (conversation) {
        io.to(`conversation:${conversation.id}`).emit('payment_confirmed', {
          paymentRequestId: paymentRequest.id,
          amount: paymentRequest.amount,
        });
      }
    }

    logger.info(`Pago procesado y notificado al cliente: ${contact.phone}`);

  } catch (err) {
    logger.error('Error procesando callback de pago:', err);
  }
};

module.exports = { handlePaymentCallback };
