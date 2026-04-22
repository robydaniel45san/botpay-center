/**
 * paycenter.http.js — Cliente HTTP crudo hacia PayCenter API
 *
 * Solo responsabilidad: hacer llamadas HTTP a PayCenter y devolver la respuesta cruda.
 * No transforma datos. No conoce el dominio de BotPay.
 * El mapeo es responsabilidad de paycenter.mapper.js
 */

const axios = require('axios');
const jwt   = require('jsonwebtoken');
const logger = require('../../config/logger');

class PayCenterHttp {
  constructor() {
    this.baseURL = process.env.PAYCENTER_API_URL || 'http://localhost:3000/api/v1/bo';
    this._token       = null;
    this._tokenExpiry = null;
  }

  _getToken() {
    const now = Date.now();
    if (this._token && this._tokenExpiry && this._tokenExpiry - now > 60_000) {
      return this._token;
    }
    const secret = process.env.PAYCENTER_JWT_SECRET || process.env.JWT_SECRET;
    this._token = jwt.sign({ system: 'botpay' }, secret, { expiresIn: '1h' });
    this._tokenExpiry = now + 3_600_000;
    return this._token;
  }

  _client() {
    return axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this._getToken()}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });
  }

  /** POST /merchant/bank/:bank/qr */
  async createQR(body) {
    const { data } = await this._client().post(`/merchant/bank/${body.bank}/qr`, body);
    logger.debug(`[PayCenter] QR creado id=${data?.id}`);
    return data;
  }

  /** GET /merchant/qr/:id/status */
  async getQRStatus(qrId) {
    const { data } = await this._client().get(`/merchant/qr/${qrId}/status`);
    logger.debug(`[PayCenter] QR status ${qrId} → ${data?.qrStatus}`);
    return data;
  }

  /** DELETE /merchant/bank/:bank/qr (body: { qrId }) */
  async cancelQR(bank, qrId) {
    const { data } = await this._client().delete(`/merchant/bank/${bank}/qr`, { data: { qrId } });
    return data;
  }
}

module.exports = new PayCenterHttp();
