const qrCreator = require('../../agents/qr-creator.agent');
const logger = require('../../../config/logger');

/**
 * Flujo de cobro QR simplificado.
 * Pasos: start → waiting_amount → waiting_bank → confirming → generating → waiting_payment
 *
 * El catálogo de productos lo gestiona PayCenter directamente.
 */
const handle = async ({ msg, input, contact, conversation, session, sessionService, sendBuilderMessage, MessageBuilder }) => {
  const phone = contact.phone;
  const step = session.currentStep;

  // ── INICIO: pedir monto ───────────────────────────────
  if (step === 'start') {
    const serviceDesc = session.context?.description ? ` — *${session.context.description}*` : '';
    await sendBuilderMessage({
      to: phone,
      method: 'sendText',
      text: `💳 *Nuevo cobro QR*${serviceDesc}\n\n¿Cuál es el monto a cobrar?\n\n_Escribe solo el número. Ej: 150 o 250.50_`,
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
        text: '⚠️ Monto inválido. Ingresá un número mayor a 0.\n\n_Ej: 150 o 250.50_',
      });
      return;
    }

    // Si el banco ya viene pre-seleccionado (desde service.flow), saltar selección
    const prefilledBank = session.context?.bank;
    const description   = session.context?.description || 'Cobro QR';

    if (prefilledBank) {
      await sessionService.updateSession(conversation.id, {
        currentStep: 'confirming',
        context:     { amount, description, bank: prefilledBank },
        retryCount:  0,
      });
      await sendBuilderMessage(MessageBuilder.confirmPayment(phone, { amount, description }));
    } else {
      await sessionService.updateSession(conversation.id, {
        currentStep: 'waiting_bank',
        context:     { amount, description },
        retryCount:  0,
      });
      await sendBuilderMessage(MessageBuilder.selectBank(phone));
    }
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
      context: { amount, description, bank },
      retryCount: 0,
    });
    await sendBuilderMessage(MessageBuilder.confirmPayment(phone, { amount, description }));
    return;
  }

  // ── CONFIRMACIÓN ──────────────────────────────────────
  if (step === 'confirming') {
    if (input === 'confirm_no' || input === 'cancelar') {
      await sessionService.resetSession(conversation.id);
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '❌ Cobro cancelado.\n\nEscribí *menú* para ver las opciones.',
      });
      return;
    }

    if (input !== 'confirm_yes') {
      const { amount, description } = session.context;
      await sendBuilderMessage(MessageBuilder.confirmPayment(phone, { amount, description }));
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

    const result = await qrCreator.run({
      conversationId: conversation.id,
      contactId:      contact.id,
      amount,
      description,
      bank,
    });

    if (result.validationError) {
      await sendBuilderMessage({
        to: phone, method: 'sendText',
        text: `⚠️ ${result.validationError}`,
      });
      await sessionService.resetSession(conversation.id);
      return;
    }

    if (result.success) {
      const msgs = qrCreator.buildSuccessMessages(phone, {
        paymentRequest: result.paymentRequest,
        amount,
        description,
      });
      for (const m of msgs) await sendBuilderMessage(m);

      await sessionService.updateSession(conversation.id, {
        currentStep: 'waiting_payment',
        context:     { paymentRequestId: result.paymentRequest.id },
        retryCount:  0,
      });
    } else {
      logger.error(`[PaymentFlow] QR fallido tras ${result.attempts} intentos: ${result.error}`);
      await sessionService.resetSession(conversation.id);
      await sendBuilderMessage(qrCreator.buildErrorMessage(phone, result));
    }
    return;
  }

  // ── ESPERANDO PAGO ────────────────────────────────────
  if (step === 'waiting_payment') {
    await sendBuilderMessage({
      to: phone,
      method: 'sendButtons',
      body: '⏳ Estamos esperando la confirmación de tu pago.\n\n¿Deseás hacer algo mientras tanto?',
      buttons: [
        { id: 'flow_status', title: '🔍 Ver estado del cobro' },
        { id: 'flow_menu',   title: '📋 Menú principal' },
      ],
    });
  }
};

module.exports = { handle };
