/**
 * Agente QR Creator
 * ─────────────────
 * Responsabilidades:
 *   1. Validar parámetros antes de llamar a PayCenter
 *   2. Generar el QR con reintentos automáticos (hasta 3 intentos)
 *   3. Detectar si PayCenter no está disponible y dar fallback claro
 *   4. Registrar métricas básicas (tiempo de generación, éxito/fallo)
 *   5. Notificar al cliente el resultado (éxito, fallo, reintento)
 *
 * Se invoca desde payment.flow.js en lugar de llamar qr.service directamente.
 */

const { generatePaymentQR } = require('../paycenter/qr.service');
const logger = require('../../config/logger');

const MAX_RETRIES   = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Valida los parámetros antes de generar el QR.
 * Retorna { valid: true } o { valid: false, reason: string }
 */
const validate = ({ amount, description, bank }) => {
  if (!amount || isNaN(amount) || amount <= 0) {
    return { valid: false, reason: 'El monto debe ser mayor a 0.' };
  }
  if (amount > 99999) {
    return { valid: false, reason: 'El monto máximo permitido es BOB 99,999.' };
  }
  const validBanks = ['bmsc', 'bnb', 'bisa'];
  if (!validBanks.includes((bank || '').toLowerCase())) {
    return { valid: false, reason: `Banco inválido: ${bank}. Opciones: bmsc, bnb, bisa.` };
  }
  if (description && description.length > 200) {
    return { valid: false, reason: 'La descripción no puede superar 200 caracteres.' };
  }
  return { valid: true };
};

/**
 * Espera un tiempo determinado.
 */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Genera un QR con reintentos automáticos.
 * Retorna { success, paymentRequest, error, attempts, durationMs }
 */
const createQRWithRetry = async ({ conversationId, contactId, amount, description, bank, expiresMinutes = 30 }) => {
  const startTime = Date.now();
  let lastError   = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`[QRCreator] Intento ${attempt}/${MAX_RETRIES} — monto=${amount} banco=${bank}`);

      const paymentRequest = await generatePaymentQR({
        conversationId,
        contactId,
        amount,
        description,
        bank,
        expiresMinutes,
      });

      const durationMs = Date.now() - startTime;
      logger.info(`[QRCreator] ✅ QR generado en ${durationMs}ms — id=${paymentRequest.id} intento=${attempt}`);

      return {
        success:        true,
        paymentRequest,
        attempts:       attempt,
        durationMs,
        error:          null,
      };

    } catch (err) {
      lastError = err;
      logger.warn(`[QRCreator] ❌ Intento ${attempt} fallido: ${err.message}`);

      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * attempt); // backoff incremental
      }
    }
  }

  const durationMs = Date.now() - startTime;
  logger.error(`[QRCreator] ❌ Todos los intentos fallaron (${durationMs}ms): ${lastError?.message}`);

  return {
    success:        false,
    paymentRequest: null,
    attempts:       MAX_RETRIES,
    durationMs,
    error:          lastError?.message || 'Error desconocido',
  };
};

/**
 * Punto de entrada principal del agente.
 * Valida, genera con reintentos y retorna resultado estructurado.
 *
 * @param {object} params
 * @param {string} params.conversationId
 * @param {string|number} params.contactId
 * @param {number} params.amount
 * @param {string} params.description
 * @param {string} params.bank
 * @param {number} [params.expiresMinutes]
 * @returns {Promise<{success, paymentRequest, error, attempts, durationMs, validationError}>}
 */
const run = async ({ conversationId, contactId, amount, description, bank, expiresMinutes = 30 }) => {
  // 1. Validación previa
  const validation = validate({ amount, description, bank });
  if (!validation.valid) {
    logger.warn(`[QRCreator] Validación fallida: ${validation.reason}`);
    return {
      success:         false,
      paymentRequest:  null,
      validationError: validation.reason,
      error:           null,
      attempts:        0,
      durationMs:      0,
    };
  }

  // 2. Generar con reintentos
  const result = await createQRWithRetry({
    conversationId,
    contactId,
    amount:         parseFloat(amount),
    description:    description || 'Cobro BotPay Center',
    bank:           bank.toLowerCase(),
    expiresMinutes,
  });

  return { ...result, validationError: null };
};

/**
 * Construye el mensaje WhatsApp de éxito al cliente.
 */
const buildSuccessMessages = (phone, { paymentRequest, amount, description }) => {
  const messages = [];

  messages.push({
    to:     phone,
    method: 'sendText',
    text:   [
      '✅ *QR generado exitosamente*',
      '',
      description ? `🛍️ Concepto: *${description}*` : null,
      `💰 Monto: *BOB ${parseFloat(amount).toFixed(2)}*`,
      `🔖 Referencia: \`${paymentRequest.paycenter_order_id}\``,
      `⏱ Válido por: *30 minutos*`,
      '',
      '📲 Mostrá el QR al cliente para que realice el pago.',
    ].filter(Boolean).join('\n'),
  });

  if (paymentRequest.qr_base64) {
    messages.push({
      to:      phone,
      method:  'sendImage',
      url:     `data:image/png;base64,${paymentRequest.qr_base64}`,
      caption: `QR de cobro — BOB ${parseFloat(amount).toFixed(2)}`,
    });
  }

  return messages;
};

/**
 * Construye el mensaje WhatsApp de fallo al cliente.
 */
const buildErrorMessage = (phone, { error, attempts }) => ({
  to:     phone,
  method: 'sendButtons',
  body:   [
    '❌ *No se pudo generar el QR*',
    '',
    attempts > 1
      ? `Se intentó ${attempts} veces sin éxito.`
      : 'Ocurrió un error al contactar con el sistema de pagos.',
    '',
    '_Por favor intentá nuevamente o contactá a soporte._',
  ].join('\n'),
  buttons: [
    { id: 'flow_payment', title: '🔄 Intentar de nuevo' },
    { id: 'flow_handoff', title: '🧑‍💼 Hablar con agente' },
  ],
});

module.exports = { run, buildSuccessMessages, buildErrorMessage, validate };
