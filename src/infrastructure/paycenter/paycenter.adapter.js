/**
 * paycenter.adapter.js — Puente real entre BotPay Center y PayCenter
 *
 * RAMA: chatbot-bridge — sin mocks, sin simulaciones.
 * Esta rama está preparada para conectar directamente con la API
 * real de PayCenter en producción.
 *
 * Variables requeridas en .env:
 *   PAYCENTER_API_URL        URL base de la API de PayCenter
 *   PAYCENTER_MERCHANT_ID    ID del comercio en PayCenter
 *   PAYCENTER_JWT_SECRET     Secreto compartido para firmar JWT
 *   PAYCENTER_ACCOUNT_BMSC   Número de cuenta BancoSol/BMSC
 *   PAYCENTER_DEFAULT_BANK   Banco por defecto (ej: bmsc)
 */

const http   = require('./paycenter.http');
const mapper = require('./paycenter.mapper');
const logger = require('../../config/logger');

const _accountNumber = (bank) => {
  const key = `PAYCENTER_ACCOUNT_${bank.toUpperCase()}`;
  return process.env[key] || null;
};

/**
 * Genera un QR de cobro en PayCenter.
 */
const createQR = async ({ bank, amount, currency, description, reference, externalRef, expiresMinutes = 30 }) => {
  const expiresAt     = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();
  const merchantId    = process.env.PAYCENTER_MERCHANT_ID;
  const accountNumber = _accountNumber(bank);

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
    logger.error('[PayCenterAdapter] createQR falló:', err.response?.data || err.message);
    throw err;
  }
};

/**
 * Consulta el estado de un QR en PayCenter.
 */
const getStatus = async (gatewayId) => {
  try {
    const raw = await http.getQRStatus(gatewayId);
    return mapper.toQRStatus(raw);
  } catch (err) {
    logger.warn(`[PayCenterAdapter] getStatus ${gatewayId} falló:`, err.message);
    return { status: 'pending', payerName: null, payerBank: null, voucherId: null };
  }
};

/**
 * Cancela un QR en PayCenter.
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
