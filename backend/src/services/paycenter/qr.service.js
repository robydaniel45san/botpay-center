/**
 * qr.service.js — Servicio de cobros QR de BotPay
 *
 * Orquesta la lógica de negocio de pagos:
 *   - Crear registro en BD antes de llamar al gateway
 *   - Delegar la comunicación con PayCenter al adapter
 *   - Sincronización manual de estado (usada por el CRM)
 *
 * NO importa paycenter.client.js ni paycenter.http.js directamente.
 * Solo habla con paycenter.adapter.js (el port).
 */

const { v4: uuidv4 }   = require('uuid');
const { PaymentRequest } = require('../../models/index');
const paymentAdapter   = require('../../infrastructure/paycenter/paycenter.adapter');
const logger           = require('../../config/logger');

/**
 * Genera un QR de cobro.
 * Crea el registro en BotPay, llama al adapter y lo actualiza con la respuesta.
 */
const generatePaymentQR = async ({
  conversationId,
  contactId,
  amount,
  description,
  bank,
  expiresMinutes = 30,
}) => {
  const bankCode    = (bank || process.env.PAYCENTER_DEFAULT_BANK || 'bmsc').toLowerCase();
  const reference   = `BP-${Date.now()}-${uuidv4().split('-')[0].toUpperCase()}`;
  const externalRef = `BOTPAY-${uuidv4().split('-')[0].toUpperCase()}`;

  // 1. Crear registro en BotPay (estado pending)
  const pr = await PaymentRequest.create({
    conversation_id:    conversationId,
    contact_id:         contactId,
    amount,
    currency_code:      'BOB',
    description:        description || 'Cobro BotPay Center',
    bank_code:          bankCode,
    paycenter_order_id: reference,
    status:             'pending',
  });

  // 2. Llamar al gateway a través del adapter
  try {
    const result = await paymentAdapter.createQR({
      bank:          bankCode,
      amount,
      description:   description || 'Cobro BotPay Center',
      reference,
      externalRef,
      expiresMinutes,
    });

    // 3. Actualizar con la respuesta del gateway (campos del dominio BotPay, no de PayCenter)
    await pr.update({
      paycenter_qr_id: result.gatewayId,
      qr_base64:       result.qrBase64,
      status:          'qr_generated',
      expired_at:      result.expiresAt,
    });

    logger.info(`[QRService] QR generado: order=${reference} gateway=${result.gatewayId}`);
    return pr.reload();

  } catch (err) {
    await pr.update({ status: 'error' });
    logger.error('[QRService] Error generando QR:', err.message);
    throw err;
  }
};

/**
 * Sincronización manual de estado (llamada desde el CRM).
 * El polling automático hace esto periódicamente,
 * pero el agente puede forzarlo desde la UI.
 */
const syncPaymentStatus = async (paymentRequestId) => {
  const pr = await PaymentRequest.findByPk(paymentRequestId);
  if (!pr || !pr.paycenter_qr_id) return pr;

  const result = await paymentAdapter.getStatus(pr.paycenter_qr_id);

  if (result.status !== pr.status) {
    const updates = { status: result.status };
    if (result.status === 'paid') {
      updates.paid_at    = new Date();
      updates.payer_name = result.payerName;
      updates.payer_bank = result.payerBank;
      updates.voucher_id = result.voucherId;
    }
    await pr.update(updates);
  }

  return pr.reload();
};

module.exports = { generatePaymentQR, syncPaymentStatus };
