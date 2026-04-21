/**
 * paycenter.adapter.js — Implementa payment.port.js usando PayCenter como gateway
 *
 * Este es el único puente entre BotPay y PayCenter.
 * Los servicios de BotPay solo importan este archivo.
 *
 * Si en el futuro se cambia de PayCenter a otro proveedor,
 * se reemplaza este archivo. Nada más cambia.
 */

const http            = require('./paycenter.http');
const mapper          = require('./paycenter.mapper');
const logger          = require('../../config/logger');
const { generateMockQR } = require('../../services/mock/qr.generator');

const MOCK_MODE = process.env.PAYCENTER_MOCK === 'true' || process.env.NODE_ENV === 'development';

const _accountNumber = (bank) => {
  const key = `PAYCENTER_ACCOUNT_${bank.toUpperCase()}`;
  return process.env[key] || (MOCK_MODE ? '0000000000' : null);
};

/**
 * Genera un QR de cobro en PayCenter.
 * @param {import('../../domain/ports/payment.port').CreateQRParams} params
 * @returns {Promise<import('../../domain/ports/payment.port').QRResult>}
 */
const createQR = async ({ bank, amount, currency, description, reference, externalRef, expiresMinutes = 30 }) => {
  const expiresAt     = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();
  const merchantId    = process.env.PAYCENTER_MERCHANT_ID;
  const accountNumber = _accountNumber(bank);

  // ── Modo mock puro: no hay PayCenter disponible ni credenciales reales ──
  const noCredentials = !process.env.PAYCENTER_JWT_SECRET && !process.env.JWT_SECRET;
  if (MOCK_MODE && noCredentials) {
    logger.warn('[PayCenterAdapter] Modo mock activo (sin credenciales) — generando QR real');
    const mockId  = `MOCK-${Date.now()}`;
    const qrBase64 = await generateMockQR({ reference: mockId, amount, bank, description, expiresAt });
    return { gatewayId: mockId, orderId: mockId, qrBase64, expiresAt, status: 'pending' };
  }

  if (!merchantId)    throw new Error('PAYCENTER_MERCHANT_ID no configurado en .env');
  if (!accountNumber) throw new Error(`PAYCENTER_ACCOUNT_${bank.toUpperCase()} no configurado en .env`);

  const body = mapper.toCreateQRBody({
    bank, merchantId, accountNumber, amount, currency,
    description, reference, externalRef, expiresAt,
  });

  try {
    const raw = await http.createQR(body);
    return mapper.toQRResult(raw);
  } catch (err) {
    // En modo desarrollo, devolver QR simulado si PayCenter no está disponible
    if (MOCK_MODE && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.response?.status >= 500)) {
      logger.warn('[PayCenterAdapter] PayCenter no disponible — usando QR mock (real PNG)');
      const mockId  = `MOCK-${Date.now()}`;
      const expires = new Date(Date.now() + (expiresMinutes || 30) * 60 * 1000).toISOString();
      const qrBase64 = await generateMockQR({ reference: mockId, amount, bank, description, expiresAt: expires });
      return { gatewayId: mockId, orderId: mockId, qrBase64, expiresAt: expires, status: 'pending' };
    }
    logger.error('[PayCenterAdapter] createQR falló:', err.response?.data || err.message);
    throw err;
  }
};

/**
 * Consulta el estado de un QR en PayCenter.
 * @param {string} gatewayId - ID del QR en PayCenter
 * @returns {Promise<import('../../domain/ports/payment.port').StatusResult>}
 */
const getStatus = async (gatewayId) => {
  try {
    const raw = await http.getQRStatus(gatewayId);
    return mapper.toQRStatus(raw);
  } catch (err) {
    logger.warn(`[PayCenterAdapter] getStatus ${gatewayId} falló:`, err.message);
    // Si PayCenter no responde, devolvemos pending para reintentar después
    return { status: 'pending', payerName: null, payerBank: null, voucherId: null };
  }
};

/**
 * Cancela un QR en PayCenter.
 * @param {string} bank
 * @param {string} gatewayId
 */
const cancelQR = async (bank, gatewayId) => {
  try {
    await http.cancelQR(bank, gatewayId);
    logger.info(`[PayCenterAdapter] QR cancelado: ${gatewayId}`);
  } catch (err) {
    logger.warn(`[PayCenterAdapter] cancelQR ${gatewayId} falló:`, err.message);
  }
};

module.exports = { createQR, getStatus, cancelQR };
