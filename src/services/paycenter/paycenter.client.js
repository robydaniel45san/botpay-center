const axios = require('axios');
const jwt = require('jsonwebtoken');
const logger = require('../../config/logger');

/**
 * Cliente HTTP para consumir la API de PayCenter.
 *
 * PayCenter es nuestra propia plataforma de pagos QR —
 * alternativa a Multipagos y Lukas para el mercado boliviano.
 * BotPay Center la usa como motor de cobros vía WhatsApp.
 *
 * Endpoints usados:
 *   POST /api/v1/bo/merchant/bank/:bank/qr         → crear QR
 *   GET  /api/v1/bo/merchant/qr/:id/status         → estado por ID interno
 *   POST /api/v1/bo/merchant/bank/:bank/qr/status  → estado desde el banco
 */
class PayCenterClient {
  constructor() {
    this.baseURL = process.env.PAYCENTER_API_URL || 'http://localhost:3000/api/v1/bo';
    this._token = null;
    this._tokenExpiry = null;
  }

  // ── JWT interno firmado con el mismo secreto que PayCenter ───
  _getToken() {
    const now = Date.now();
    if (this._token && this._tokenExpiry && this._tokenExpiry - now > 60_000) {
      return this._token;
    }
    const secret = process.env.PAYCENTER_JWT_SECRET || process.env.JWT_SECRET;
    this._token = jwt.sign(
      { system: 'central' },   // PayCenter valida este campo
      secret,
      { expiresIn: '1h' }
    );
    this._tokenExpiry = now + 3_600_000;
    return this._token;
  }

  _http() {
    return axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this._getToken()}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // POST /merchant/bank/:bank/qr
  //
  // Body requerido (validado por PayCenter):
  //   merchantId    number    ID del merchant en PayCenter
  //   accountNumber string    Número de cuenta bancaria
  //   countryCode   string    ISO 3166-1 alpha-2  ej: "BO"
  //   currencyCode  string    ISO 4217             ej: "BOB"
  //   amount        float     >= 0.01
  //   description   string
  //   expiredAt     ISO8601   fecha futura         ej: "2026-04-15T18:00:00Z"
  //   singleUse     boolean
  //   externalId    string    referencia del merchant
  //   orderId       string    identificador de orden
  //   qrFormat      string    "image" | "base64"
  //   qrType        string    "simple" | "domiciliacion" | "base64"
  //
  // Respuesta exitosa 201:
  //   { id, accountBankId, externalId, orderId, qrExternalId,
  //     qrCodeData (base64), qrType, amount, currencyCode,
  //     description, countryCode, singleUse, status,
  //     createdAt, updatedAt, expiredAt, expiredBankAt }
  // ─────────────────────────────────────────────────────────────
  async createQR({ bank, merchantId, accountNumber, countryCode, currencyCode,
                   amount, description, expiredAt, singleUse, externalId, orderId,
                   qrFormat = 'base64', qrType = 'simple' }) {
    try {
      const { data } = await this._http().post(`/merchant/bank/${bank}/qr`, {
        merchantId,
        accountNumber,
        countryCode:  (countryCode  || 'BO').toUpperCase(),
        currencyCode: (currencyCode || 'BOB').toUpperCase(),
        amount,
        description,
        expiredAt,
        singleUse,
        externalId,
        orderId,
        qrFormat,
        qrType,
      });
      logger.info(`PayCenter QR creado: id=${data?.id} orderId=${orderId}`);
      return data; // { id, qrCodeData (base64), status: "active", ... }
    } catch (err) {
      const detail = err.response?.data || err.message;
      logger.error('PayCenter createQR error:', detail);
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // GET /merchant/qr/:id/status
  //
  // Params:
  //   id  UUID interno del QR (qr.id)
  //
  // Respuesta 200:
  //   { qrId, qrExternalId, qrStatus }
  //   qrStatus: "pending" | "active" | "used" | "expired" | "inactive" | "cancelled"
  // ─────────────────────────────────────────────────────────────
  async getQRStatus(qrId) {
    try {
      const { data } = await this._http().get(`/merchant/qr/${qrId}/status`);
      logger.debug(`PayCenter QR status: ${qrId} → ${data?.qrStatus}`);
      return data; // { qrId, qrExternalId, qrStatus }
    } catch (err) {
      const detail = err.response?.data || err.message;
      logger.error('PayCenter getQRStatus error:', detail);
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // POST /merchant/bank/:bank/qr/status
  //
  // Body: { qrId: string }   (puede ser UUID interno, qrExternalId o externalId)
  //
  // Respuesta 200: respuesta del banco enriquecida con
  //   { order_id, amount, currency, ...campos del banco }
  // ─────────────────────────────────────────────────────────────
  async getBankQRStatus({ bank, qrId }) {
    try {
      const { data } = await this._http().post(`/merchant/bank/${bank}/qr/status`, { qrId });
      return data;
    } catch (err) {
      const detail = err.response?.data || err.message;
      logger.error('PayCenter getBankQRStatus error:', detail);
      throw err;
    }
  }
}

module.exports = new PayCenterClient();
