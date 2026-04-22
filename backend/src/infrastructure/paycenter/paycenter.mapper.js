/**
 * paycenter.mapper.js — Anti-Corruption Layer
 *
 * Traduce entre el idioma de PayCenter y el dominio de BotPay.
 * Es el único archivo que conoce los nombres de campos de PayCenter.
 *
 * Si PayCenter renombra un campo (ej: qrCodeData → qrImageBase64),
 * solo se cambia aquí. El resto de BotPay no se toca.
 */

/**
 * Respuesta cruda de PayCenter al crear un QR:
 *   { id, accountBankId, externalId, orderId, qrExternalId,
 *     qrCodeData (base64), qrType, amount, currencyCode,
 *     status, expiredAt, expiredBankAt, ... }
 *
 * → QRResult del dominio BotPay
 */
const toQRResult = (raw) => ({
  gatewayId: raw.id,
  qrBase64:  raw.qrCodeData ?? null,
  expiresAt: raw.expiredAt ? new Date(raw.expiredAt) : null,
});

/**
 * Respuesta de GET /merchant/qr/:id/status:
 *   { qrId, qrExternalId, qrStatus }
 *   qrStatus: "pending" | "active" | "used" | "expired" | "inactive" | "cancelled"
 *
 * → QRStatus del dominio BotPay
 */
const STATUS_MAP = {
  pending:   'pending',
  active:    'qr_generated',
  used:      'paid',
  expired:   'expired',
  inactive:  'expired',
  cancelled: 'cancelled',
};

const toQRStatus = (raw) => ({
  status:    STATUS_MAP[raw.qrStatus] ?? 'pending',
  payerName: raw.payerName  ?? null,
  payerBank: raw.payerBank  ?? null,
  voucherId: raw.voucherId  ?? null,
});

/**
 * Construye el body exacto que PayCenter espera para crear un QR.
 */
const toCreateQRBody = ({ bank, merchantId, accountNumber, amount, currency,
                          description, reference, externalRef, expiresAt }) => ({
  bank:          bank.toLowerCase(),
  merchantId:    parseInt(merchantId),
  accountNumber,
  countryCode:   'BO',
  currencyCode:  (currency || 'BOB').toUpperCase(),
  amount,
  description:   description || 'Cobro BotPay Center',
  expiredAt:     expiresAt,
  singleUse:     true,
  externalId:    externalRef,
  orderId:       reference,
  qrFormat:      'base64',
  qrType:        'simple',
});

module.exports = { toQRResult, toQRStatus, toCreateQRBody };
