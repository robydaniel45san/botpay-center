const { generatePaymentQR } = require('../../paycenter/qr.service'); // → usa paycenter.adapter internamente
const logger = require('../../../config/logger');

/**
 * Flujo de cobro QR directo.
 * Pasos: start → waiting_amount → waiting_bank → confirm → generating → done
 */
const handle = async ({ msg, input, contact, conversation, session, sessionService, sendBuilderMessage, MessageBuilder }) => {
  const phone = contact.phone;
  const step = session.currentStep;

  // ── INICIO: solicitar monto ───────────────────────────
  if (step === 'start') {
    await sendBuilderMessage({
      to: phone,
      method: 'sendText',
      text: '💳 *Nuevo cobro QR*\n\n¿Cuál es el monto a cobrar?\n\n_Escribe solo el número. Ej: 150 o 250.50_',
    });
    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_amount' });
    return;
  }

  // ── ESPERANDO MONTO ───────────────────────────────────
  if (step === 'waiting_amount') {
    const amount = parseFloat(input.replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || amount > 99999) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '⚠️ Monto inválido. Ingresa un número válido mayor a 0.\n\n_Ej: 150 o 250.50_',
      });
      return;
    }

    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_description',
      context: { amount },
      retryCount: 0,
    });

    await sendBuilderMessage({
      to: phone,
      method: 'sendText',
      text: `✅ Monto: *BOB ${amount.toFixed(2)}*\n\n¿Cuál es el concepto del cobro?\n\n_Ej: Consulta médica, Corte de cabello, Pago cuota_\n_(Escribe "saltar" si no quieres agregar descripción)_`,
    });
    return;
  }

  // ── ESPERANDO DESCRIPCIÓN ─────────────────────────────
  if (step === 'waiting_description') {
    const description = input === 'saltar' ? 'Cobro generado por BotPay' : msg.text?.trim() || 'Cobro BotPay';

    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_bank',
      context: { description },
      retryCount: 0,
    });

    await sendBuilderMessage(MessageBuilder.selectBank(phone));
    return;
  }

  // ── ESPERANDO BANCO ───────────────────────────────────
  if (step === 'waiting_bank') {
    const bankMap = { bank_bmsc: 'bmsc', bank_bnb: 'bnb', bank_bisa: 'bisa' };
    const bank = bankMap[input];

    if (!bank) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage(MessageBuilder.selectBank(phone));
      return;
    }

    const { amount, description } = session.context;
    await sessionService.updateSession(conversation.id, {
      currentStep: 'confirming',
      context: { bank },
      retryCount: 0,
    });

    await sendBuilderMessage(MessageBuilder.confirmAmount(phone, amount));
    return;
  }

  // ── CONFIRMACIÓN ──────────────────────────────────────
  if (step === 'confirming') {
    if (input === 'confirm_no' || input === 'cancelar') {
      await sessionService.resetSession(conversation.id);
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '❌ Cobro cancelado.\n\nEscribe *menú* para ver las opciones.',
      });
      return;
    }

    if (input !== 'confirm_yes') {
      await sendBuilderMessage(MessageBuilder.confirmAmount(phone, session.context.amount));
      return;
    }

    // Generar QR
    await sessionService.updateSession(conversation.id, { currentStep: 'generating' });
    await sendBuilderMessage({
      to: phone,
      method: 'sendText',
      text: '⏳ Generando tu QR de cobro...',
    });

    const { amount, description, bank } = session.context;

    try {
      const paymentRequest = await generatePaymentQR({
        conversationId: conversation.id,
        contactId: contact.id,
        amount,
        description,
        bank,
      });

      // Enviar texto de confirmación
      await sendBuilderMessage(MessageBuilder.qrGenerated(phone, {
        amount,
        orderId: paymentRequest.paycenter_order_id,
        expiresMinutes: 30,
      }));

      // Enviar imagen QR si está disponible
      if (paymentRequest.qr_base64) {
        await sendBuilderMessage({
          to: phone,
          method: 'sendImage',
          url: `data:image/png;base64,${paymentRequest.qr_base64}`,
          caption: `QR de cobro — BOB ${parseFloat(amount).toFixed(2)}`,
        });
      }

      await sessionService.updateSession(conversation.id, {
        currentStep: 'waiting_payment',
        context: { paymentRequestId: paymentRequest.id },
        retryCount: 0,
      });

    } catch (err) {
      logger.error('Error generando QR en PayCenter:', err.message);
      await sessionService.resetSession(conversation.id);
      await sendBuilderMessage({
        to: phone,
        method: 'sendButtons',
        body: '❌ No se pudo generar el QR. Por favor intenta nuevamente o contacta a soporte.',
        buttons: [
          { id: 'flow_payment', title: '🔄 Intentar de nuevo' },
          { id: 'flow_handoff', title: '🧑‍💼 Hablar con agente' },
        ],
      });
    }
    return;
  }

  // ── ESPERANDO PAGO (push desde PayCenter) ─────────────
  if (step === 'waiting_payment') {
    // En este paso el bot espera el callback de PayCenter.
    // Si el cliente escribe algo, le recordamos que espere.
    await sendBuilderMessage({
      to: phone,
      method: 'sendButtons',
      body: '⏳ Estamos esperando la confirmación de tu pago.\n\n¿Deseas hacer algo mientras tanto?',
      buttons: [
        { id: 'flow_status', title: '🔍 Ver estado del cobro' },
        { id: 'flow_menu', title: '📋 Menú principal' },
      ],
    });
  }
};

module.exports = { handle };
