/**
 * qr.generator.js — Generador de QR mock usando datos reales de pago
 *
 * Usa el paquete `qrcode` para generar imágenes PNG reales (escaneables).
 * Se activa cuando PayCenter no está disponible (PAYCENTER_MOCK=true o ECONNREFUSED).
 *
 * El payload del QR sigue el formato simplificado de Bolivia QR (estándar ASFI):
 *   versión | tipo | monto | moneda | referencia | descripción | expiración
 */

const QRCode = require('qrcode');

/**
 * Genera un QR PNG real (scaneable) con los datos del pago.
 *
 * @param {object} params
 * @param {string} params.reference      - ID/referencia del pago
 * @param {number} params.amount         - Monto en BOB
 * @param {string} [params.bank]         - Banco receptor (ej: 'bmsc', 'bcp')
 * @param {string} [params.description]  - Descripción del pago
 * @param {string} [params.expiresAt]    - ISO string de expiración
 * @returns {Promise<string>}            - Base64 PNG (sin prefijo data:image/...)
 */
const generateMockQR = async ({ reference, amount, bank = 'bmsc', description = '', expiresAt }) => {
  // Payload estructurado — compatible con lectores QR estándar
  const payload = [
    '00:01',                                          // versión + init
    `01:MOCK`,                                        // modo: simulación
    `26:${(bank || 'bmsc').toUpperCase()}`,           // banco receptor
    `54:${parseFloat(amount).toFixed(2)}`,            // monto
    `53:BOB`,                                         // moneda
    `62:${reference}`,                                // referencia
    `80:${description.slice(0, 50)}`,                 // descripción truncada
    `99:${expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString()}`, // expiración
  ].join('|');

  const base64url = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    type:                 'image/png',
    width:                300,
    margin:               2,
    color: {
      dark:  '#000000',
      light: '#FFFFFF',
    },
  });

  // Quitar el prefijo "data:image/png;base64," — el caller lo agrega cuando necesite
  return base64url.replace(/^data:image\/png;base64,/, '');
};

module.exports = { generateMockQR };
