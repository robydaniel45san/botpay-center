/**
 * Flujo de pago de servicios — estilo Lukas/Multipagos.
 * Estados: start → waiting_service → waiting_bank → waiting_action
 *
 * El usuario elige el tipo de servicio, luego su banco, y luego si quiere
 * generar un QR de cobro o ver el estado de sus QR anteriores.
 * Al confirmar la acción, delega al flujo correspondiente (payment / status).
 */

const SERVICE_MAP = {
  svc_electricidad: 'Electricidad',
  svc_agua:         'Agua',
  svc_internet:     'Internet / Telefonía',
  svc_otros:        'Otros servicios',
};

const BANK_MAP = {
  bank_bmsc: 'bmsc',
  bank_bnb:  'bnb',
  bank_bisa: 'bisa',
};

const handle = async ({ msg, input, contact, conversation, session, sessionService, sendBuilderMessage, MessageBuilder }) => {
  const phone = contact.phone;
  const step  = session.currentStep;

  // ── INICIO: mostrar menú de servicios ─────────────────
  if (step === 'start') {
    await sendBuilderMessage({
      to:     phone,
      method: 'sendText',
      text:   '🏠 *Pago de Servicios*\n\nSeleccioná el servicio que deseas pagar:',
    });
    await sendBuilderMessage(MessageBuilder.serviceTypeMenu(phone));
    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_service' });
    return;
  }

  // ── ESPERANDO SERVICIO ────────────────────────────────
  if (step === 'waiting_service') {
    const serviceName = SERVICE_MAP[input];
    if (!serviceName) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage(MessageBuilder.serviceTypeMenu(phone));
      return;
    }

    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_bank',
      context:     { service: serviceName },
      retryCount:  0,
    });
    await sendBuilderMessage({
      to:     phone,
      method: 'sendText',
      text:   `✅ *${serviceName}*\n\n¿Con qué banco deseas realizar el pago?`,
    });
    await sendBuilderMessage(MessageBuilder.selectBank(phone));
    return;
  }

  // ── ESPERANDO BANCO ───────────────────────────────────
  if (step === 'waiting_bank') {
    const bank = BANK_MAP[input];
    if (!bank) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage(MessageBuilder.selectBank(phone));
      return;
    }

    const { service } = session.context;
    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_action',
      context:     { service, bank },
      retryCount:  0,
    });
    await sendBuilderMessage(MessageBuilder.serviceActionMenu(phone, { service, bank }));
    return;
  }

  // ── ESPERANDO ACCIÓN ──────────────────────────────────
  if (step === 'waiting_action') {
    const { service, bank } = session.context;

    if (input === 'svc_action_qr') {
      // Pasar al flujo de pago con banco y descripción pre-cargados
      await sessionService.updateSession(conversation.id, {
        currentFlow: 'payment',
        currentStep: 'start',
        context:     { bank, description: service },
        retryCount:  0,
      });
      const updatedSession = await sessionService.getSession(conversation.id);
      const paymentFlow = require('./payment.flow');
      await paymentFlow.handle({ msg, input, contact, conversation, session: updatedSession, sessionService, sendBuilderMessage, MessageBuilder });
      return;
    }

    if (input === 'svc_action_status') {
      await sessionService.updateSession(conversation.id, {
        currentFlow: 'status',
        currentStep: 'start',
        context:     {},
        retryCount:  0,
      });
      const updatedSession = await sessionService.getSession(conversation.id);
      const statusFlow = require('./status.flow');
      await statusFlow.handle({ msg, input, contact, conversation, session: updatedSession, sessionService, sendBuilderMessage, MessageBuilder });
      return;
    }

    // Input no reconocido
    await sessionService.incrementRetry(conversation.id);
    await sendBuilderMessage(MessageBuilder.serviceActionMenu(phone, { service, bank }));
  }
};

module.exports = { handle };
