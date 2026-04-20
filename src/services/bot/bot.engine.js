const sessionService = require('./session.service');
const whatsapp = require('../whatsapp/whatsapp.service');
const MessageBuilder = require('../whatsapp/message.builder');
const receptionist = require('../agents/receptionist.agent');
const orchestrator = require('../agents/orchestrator.agent');
const { Conversation } = require('../../models/index');
const logger = require('../../config/logger');

// Deduplicación: evita procesar el mismo mensaje dos veces (Meta puede enviar duplicados)
const _processedIds = new Map(); // waMessageId → timestamp
const DEDUP_TTL = 60_000; // 1 minuto
const _isDuplicate = (waId) => {
  if (!waId) return false;
  const now = Date.now();
  // Limpiar entradas viejas
  for (const [id, ts] of _processedIds) {
    if (now - ts > DEDUP_TTL) _processedIds.delete(id);
  }
  if (_processedIds.has(waId)) return true;
  _processedIds.set(waId, now);
  return false;
};

// Flujos — se cargan aquí para evitar dependencias circulares
const flows = {
  welcome: require('./flows/welcome.flow'),
  service: require('./flows/service.flow'),
  payment: require('./flows/payment.flow'),
  booking: require('./flows/booking.flow'),
  status:  require('./flows/status.flow'),
  handoff: require('./flows/handoff.flow'),
  faq:     require('./flows/faq.flow'),
  agenda:  require('../agents/agenda.agent'),
};

const MAX_RETRIES = 3;

/**
 * Envía cualquier mensaje construido con MessageBuilder.
 * Detecta el método correcto según el objeto retornado.
 */
const sendBuilderMessage = async (msg) => {
  const { to, method, ...rest } = msg;
  switch (method) {
    case 'sendText':       return whatsapp.sendText(to, rest.text);
    case 'sendButtons':    return whatsapp.sendButtons(to, rest);
    case 'sendList':       return whatsapp.sendList(to, rest);
    case 'sendImage':      return whatsapp.sendImage(to, rest);
    case 'sendTemplate':   return whatsapp.sendTemplate(to, rest);
    default:               return whatsapp.sendText(to, rest.text || JSON.stringify(rest));
  }
};

/**
 * Normaliza la entrada del usuario a un string canónico.
 * Maneja texto plano, respuestas de botones e ítems de lista.
 */
const normalizeInput = (msg) => {
  if (msg.interactive?.reply) {
    return msg.interactive.reply.id || '';
  }
  return (msg.text || '').trim().toLowerCase();
};

/**
 * Determina si el input activa el menú principal.
 */
const isMenuTrigger = (input) =>
  ['menu', 'menú', 'inicio', 'hola', 'hi', 'start', '0', 'flow_menu'].includes(input);

/**
 * Motor principal del bot.
 * Recibe el mensaje normalizado + contexto y delega al flujo correcto.
 */
const process = async ({ msg, contact, conversation }) => {
  // ── Deduplicación: descartar mensajes repetidos de Meta ─
  if (_isDuplicate(msg.id)) {
    logger.debug(`[BotEngine] Mensaje duplicado ignorado: ${msg.id}`);
    return;
  }

  const phone = msg.from;
  const input = normalizeInput(msg);

  let session = await sessionService.getSession(conversation.id);
  if (!session) {
    session = await sessionService.updateSession(conversation.id, {
      conversationId: conversation.id,
      contactId: contact.id,
      currentFlow: null,
      currentStep: null,
      context: {},
    });
  }

  // ── Timeout de sesión: resetear si lleva más de 30 min inactiva ─
  if (session.lastInteractionAt) {
    const elapsed = Date.now() - new Date(session.lastInteractionAt).getTime();
    if (elapsed > sessionService.SESSION_TIMEOUT && session.currentFlow && session.currentFlow !== 'menu') {
      logger.info(`[BotEngine] Sesión expirada (${Math.round(elapsed / 60000)}min) — reseteando`);
      await sessionService.resetSession(conversation.id);
      session = await sessionService.getSession(conversation.id);
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '⏰ Tu sesión expiró por inactividad. Escribí *menú* para empezar de nuevo.',
      });
      return;
    }
  }

  // ── Control de reintentos ──────────────────────────────
  if (session.retryCount >= MAX_RETRIES) {
    await sessionService.resetSession(conversation.id);
    const errMsg = MessageBuilder.errorMessage(phone, true);
    await sendBuilderMessage(errMsg);
    return;
  }

  // ── Trigger de menú principal ──────────────────────────
  if (isMenuTrigger(input) || !session.currentFlow) {
    await sessionService.resetSession(conversation.id);
    // Agente Recepcionista: saludo + menú adaptado al negocio
    const messages = receptionist.greet(phone, contact.name);
    for (const m of messages) {
      await sendBuilderMessage(m);
      if (messages.length > 1) await new Promise((r) => setTimeout(r, 700));
    }
    await sessionService.updateSession(conversation.id, { currentFlow: 'menu', currentStep: 'waiting_selection' });
    return;
  }

  // ── Orquestador: detección de intención desde texto libre ─
  if (session.currentFlow === 'menu' && session.currentStep === 'waiting_selection') {
    // Primero intentar mapeo directo del menú
    const flowMap = {
      flow_service: 'service',
      flow_payment: 'payment',
      flow_status:  'status',
      flow_handoff: 'handoff',
      flow_faq:     'faq',
      flow_booking: 'booking',
      flow_agenda:  'agenda',
    };
    let selectedFlow = flowMap[input];

    // Si no hay match directo, usar el Orquestador para detectar intención
    if (!selectedFlow) {
      const detectedFlow = orchestrator.routeIntent(input, session);
      if (detectedFlow) {
        logger.info(`[Orquestador] Intención detectada: "${input}" → ${detectedFlow}`);
        selectedFlow = detectedFlow;
      }
    }

    if (selectedFlow) {
      await sessionService.updateSession(conversation.id, {
        currentFlow: selectedFlow,
        currentStep: 'start',
        context: {},
      });
      session = await sessionService.getSession(conversation.id);
    } else {
      // Input no reconocido en el menú
      await sessionService.incrementRetry(conversation.id);
      const notUnderstood = MessageBuilder.notUnderstood(phone);
      await sendBuilderMessage(notUnderstood);
      return;
    }
  }

  // ── Delegar al flujo activo ────────────────────────────
  const activeFlow = flows[session.currentFlow];
  if (!activeFlow) {
    logger.warn(`Flujo desconocido: ${session.currentFlow} — reseteando`);
    await sessionService.resetSession(conversation.id);
    const menu = MessageBuilder.mainMenu(phone);
    await sendBuilderMessage(menu);
    return;
  }

  try {
    await activeFlow.handle({
      msg,
      input,
      contact,
      conversation,
      session,
      sessionService,
      whatsapp,
      sendBuilderMessage,
      MessageBuilder,
    });
  } catch (err) {
    logger.error(`Error en flujo ${session.currentFlow}:`, err);
    await sessionService.incrementRetry(conversation.id);
    const errMsg = MessageBuilder.errorMessage(phone, true);
    await sendBuilderMessage(errMsg);
  }
};

/**
 * Notifica al cliente de un pago recibido (llamado por el callback de PayCenter).
 * No depende de la sesión activa — es push desde el sistema.
 */
const notifyPaymentReceived = async ({ phone, paymentRequest }) => {
  const msg = MessageBuilder.paymentReceived(phone, {
    amount: paymentRequest.amount,
    currency: paymentRequest.currency_code,
    orderId: paymentRequest.paycenter_order_id,
    payerName: paymentRequest.payer_name,
    voucherId: paymentRequest.voucher_id,
  });
  await sendBuilderMessage(msg);

  // Actualizar estado de la conversación
  if (paymentRequest.conversation_id) {
    await Conversation.update(
      { status: 'resolved', resolved_at: new Date() },
      { where: { id: paymentRequest.conversation_id } }
    );
  }
};

module.exports = { process, notifyPaymentReceived, sendBuilderMessage };
