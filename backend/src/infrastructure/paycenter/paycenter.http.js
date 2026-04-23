/**
 * paycenter.http.js — Cliente HTTP hacia PayCenter API
 *
 * Autenticación: OAuth2 Client Credentials via Keycloak (máquina a máquina)
 *
 * Flujo:
 *   1. BotPay solicita token a Keycloak con CLIENT_ID + CLIENT_SECRET
 *   2. Keycloak valida el cliente y devuelve un access_token
 *   3. BotPay usa ese token como Bearer en cada llamada a PayCenter
 *   4. El token se cachea hasta 60s antes de su expiración
 *
 * Variables requeridas en backend/.env:
 *   PAYCENTER_API_URL        URL base del API  (ej: http://localhost:3000/api/v1/bo)
 *   PAYCENTER_TOKEN_URL      Endpoint de token Keycloak
 *                            (ej: https://test.api.pay-center.cloud/realms/Pay-Center/protocol/openid-connect/token)
 *   PAYCENTER_CLIENT_ID      Client ID registrado en Keycloak
 *   PAYCENTER_CLIENT_SECRET  Client Secret de Keycloak
 */

const axios  = require('axios');
const logger = require('../../config/logger');

class PayCenterHttp {
  constructor() {
    this.baseURL      = process.env.PAYCENTER_API_URL      || 'http://localhost:3000/api/v1/bo';
    this.tokenURL     = process.env.PAYCENTER_TOKEN_URL    || '';
    this.clientId     = process.env.PAYCENTER_CLIENT_ID    || '';
    this.clientSecret = process.env.PAYCENTER_CLIENT_SECRET || '';
    this._token       = null;
    this._tokenExpiry = null;
  }

  /**
   * Pide un nuevo access_token a Keycloak via Client Credentials.
   */
  async _fetchToken() {
    if (!this.tokenURL || !this.clientId || !this.clientSecret) {
      throw new Error(
        'Faltan variables de PayCenter en .env: PAYCENTER_TOKEN_URL, PAYCENTER_CLIENT_ID, PAYCENTER_CLIENT_SECRET'
      );
    }

    const params = new URLSearchParams();
    params.append('grant_type',    'client_credentials');
    params.append('client_id',     this.clientId);
    params.append('client_secret', this.clientSecret);

    const { data } = await axios.post(this.tokenURL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    });

    this._token       = data.access_token;
    // Renovar 60s antes de que expire
    this._tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    logger.debug('[PayCenter] Token OAuth2 obtenido (expira en ' + data.expires_in + 's)');
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
   * Crea una instancia Axios con el Bearer token vigente.
   */
  async _client() {
    const token = await this._getToken();
    return axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });
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
