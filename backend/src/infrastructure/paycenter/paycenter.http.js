/**
 * paycenter.http.js — Cliente HTTP hacia PayCenter API
 *
 * Autenticación: OAuth2 Password Grant via Keycloak
 *
 * Variables requeridas en backend/.env:
 *   PAYCENTER_API_URL        URL base del API
 *   PAYCENTER_TOKEN_URL      Endpoint token Keycloak
 *   PAYCENTER_CLIENT_ID      client-bot-pay-center
 *   PAYCENTER_CLIENT_SECRET  Client secret de Keycloak
 *   PAYCENTER_USERNAME       Usuario bot en Keycloak
 *   PAYCENTER_PASSWORD       Contraseña del usuario bot
 */

const axios  = require('axios');
const logger = require('../../config/logger');

class PayCenterHttp {
  constructor() {
    this.baseURL      = process.env.PAYCENTER_API_URL       || 'http://localhost:3000/api/v1/bo';
    this.tokenURL     = process.env.PAYCENTER_TOKEN_URL     || '';
    this.clientId     = process.env.PAYCENTER_CLIENT_ID     || '';
    this.clientSecret = process.env.PAYCENTER_CLIENT_SECRET || '';
    this.username     = process.env.PAYCENTER_USERNAME      || '';
    this.password     = process.env.PAYCENTER_PASSWORD      || '';
    this._token       = null;
    this._tokenExpiry = null;
  }

  /**
   * Pide token a Keycloak via Password Grant.
   * Si no hay credenciales configuradas, llama al central sin auth (dev local).
   */
  async _fetchToken() {
    if (!this.tokenURL || !this.clientId) {
      logger.warn('[PayCenter] Sin credenciales Keycloak — llamando sin Bearer token');
      this._token       = null;
      this._tokenExpiry = Date.now() + 3600 * 1000;
      return null;
    }

    const params = new URLSearchParams();
    params.append('grant_type',    'password');
    params.append('client_id',     this.clientId);
    params.append('client_secret', this.clientSecret);
    params.append('username',      this.username);
    params.append('password',      this.password);

    const { data } = await axios.post(this.tokenURL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    });

    this._token       = data.access_token;
    // Renovar 60s antes de que expire
    this._tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    logger.info('[PayCenter] Token Keycloak obtenido (expira en ' + data.expires_in + 's)');
    return this._token;
  }

  /**
   * Devuelve el token vigente o solicita uno nuevo si expiró.
   */
  async _getToken() {
    if (this._token && this._tokenExpiry && Date.now() < this._tokenExpiry) {
      return this._token;
    }
    return this._fetchToken();
  }

  /**
   * Crea una instancia Axios con el Bearer token vigente (o sin auth si no hay Keycloak).
   */
  async _client() {
    const token = await this._getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return axios.create({ baseURL: this.baseURL, headers, timeout: 15_000 });
  }

  /** POST /merchant/bank/:bank/qr */
  async createQR(body) {
    const client = await this._client();
    const { data } = await client.post(`/merchant/bank/${body.bank}/qr`, body);
    logger.debug(`[PayCenter] QR creado id=${data?.id}`);
    return data;
  }

  /** GET /merchant/qr/:id/status */
  async getQRStatus(qrId) {
    const client = await this._client();
    const { data } = await client.get(`/merchant/qr/${qrId}/status`);
    logger.debug(`[PayCenter] QR status ${qrId} → ${data?.qrStatus}`);
    return data;
  }

  /** DELETE /merchant/bank/:bank/qr  body: { qrId } */
  async cancelQR(bank, qrId) {
    const client = await this._client();
    const { data } = await client.delete(`/merchant/bank/${bank}/qr`, { data: { qrId } });
    return data;
  }
}

module.exports = new PayCenterHttp();
