/**
 * service.flow.js — Selección de servicio a pagar
 *
 * Pasos:
 *   start           → muestra menú de tipo de servicio
 *   waiting_service → usuario elige el tipo
 *                     • agua / electricidad / internet → bill-payment.flow
 *                     • svc_otros → pide banco → payment.flow (QR genérico)
 *   waiting_bank    → (solo svc_otros) usuario elige banco → payment.flow
 */

const SERVICE_DISPLAY = {
  svc_electricidad: 'Electricidad',
  svc_agua:         'Agua',
  svc_internet:     'Internet / Telefonía',
  svc_otros:        'Otros servicios',
};

// Tipo interno: clave para utility.mock (null = sin facturas → QR genérico)
const SERVICE_TYPE = {
  svc_electricidad: 'electricidad',
  svc_agua:         'agua',
  svc_internet:     'internet',
  svc_otros:        null,
};

const BANK_MAP = {
  bank_bmsc: 'bmsc',
  bank_bnb:  'bnb',
  bank_bisa: 'bisa',
};

const handle = async ({
  msg, input, contact, conversation,
  session, sessionService, sendBuilderMessage, MessageBuilder,
}) => {
  const phone = contact.phone;
  const step  = session.currentStep;

  // ── START — menú de servicios ─────────────────────────
  if (step === 'start') {
    await sendBuilderMessage(MessageBuilder.serviceTypeMenu(phone));
    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_service' });
    return;
  }

  // ── WAITING_SERVICE — elegir tipo ─────────────────────
  if (step === 'waiting_service') {
    const service     = SERVICE_DISPLAY[input];
    const serviceType = SERVICE_TYPE[input];  // null → svc_otros

    if (!service) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage(MessageBuilder.serviceTypeMenu(phone));
      return;
    }

    // ── Servicios con facturación → bill-payment ────────
    if (serviceType) {
      await sessionService.updateSession(conversation.id, {
        currentFlow: 'bill-payment',
        currentStep: 'start',
        context:     { service, serviceType },
        retryCount:  0,
      });
      const updSession      = await sessionService.getSession(conversation.id);
      const billPaymentFlow = require('./bill-payment.flow');
      await billPaymentFlow.handle({
        msg, input, contact, conversation,
        session: updSession, sessionService, sendBuilderMessage, MessageBuilder,
      });
      return;
    }

    // ── Otros servicios → pedir banco ──────────────────
    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_bank',
      context:     { service },
      retryCount:  0,
    });
    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text: `✅ *${service}*\n\n¿Con qué banco deseas generar el QR?`,
    });
    await sendBuilderMessage(MessageBuilder.selectBank(phone));
    return;
  }

  // ── WAITING_BANK — (solo svc_otros) elegir banco ──────
  if (step === 'waiting_bank') {
    const bank = BANK_MAP[input];
    if (!bank) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage(MessageBuilder.selectBank(phone));
      return;
    }

    const { service } = session.context;
    await sessionService.updateSession(conversation.id, {
      currentFlow: 'payment',
      currentStep: 'start',
      context:     { bank, description: service },
      retryCount:  0,
    });
    const updSession  = await sessionService.getSession(conversation.id);
    const paymentFlow = require('./payment.flow');
    await paymentFlow.handle({
      msg, input, contact, conversation,
      session: updSession, sessionService, sendBuilderMessage, MessageBuilder,
    });
    return;
  }

  // Fallback
  await sessionService.resetSession(conversation.id);
  await sendBuilderMessage(MessageBuilder.mainMenu(phone));
};

module.exports = { handle };
