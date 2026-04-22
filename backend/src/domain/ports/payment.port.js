/**
 * payment.port.js — Contrato de pasarela de pago
 *
 * BotPay Center solo conoce esta interfaz.
 * PayCenter (o cualquier otro proveedor) la implementa en infrastructure/.
 *
 * Si PayCenter cambia su API, solo se toca paycenter.adapter.js.
 * El bot, los flows y el CRM no se enteran.
 *
 * @typedef {Object} CreateQRParams
 * @property {string} bank          - 'bnb' | 'bmsc' | 'bisa'
 * @property {number} amount        - Monto >= 0.01
 * @property {string} [currency]    - Default 'BOB'
 * @property {string} description
 * @property {string} reference     - ID interno de BotPay (orderId)
 * @property {string} externalRef   - Referencia externa única
 * @property {number} [expiresMinutes] - Default 30
 *
 * @typedef {Object} QRResult
 * @property {string} gatewayId     - ID del QR en el gateway (PayCenter)
 * @property {string} qrBase64      - Imagen lista para enviar/mostrar
 * @property {Date}   expiresAt     - Cuándo vence el QR
 *
 * @typedef {'pending'|'paid'|'expired'|'cancelled'|'error'} QRStatus
 *
 * @typedef {Object} StatusResult
 * @property {QRStatus} status
 * @property {string}   [payerName]
 * @property {string}   [payerBank]
 * @property {string}   [voucherId]
 */

// Este módulo documenta el contrato.
// La implementación real está en:
//   src/infrastructure/paycenter/paycenter.adapter.js
//
// Uso en servicios:
//   const payment = require('../../infrastructure/paycenter/paycenter.adapter');
//   const result = await payment.createQR({ bank, amount, description, reference, externalRef });
//   const status = await payment.getStatus(gatewayId);

module.exports = {};
