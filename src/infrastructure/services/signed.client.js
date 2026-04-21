/**
 * signed.client.js — Cliente HTTP con firma automática por servicio
 *
 * Fábrica de clientes Axios pre-configurados con la autenticación
 * definida en service.registry.js.
 *
 * Uso:
 *   const client = signedClient.for('saguapac');
 *   const data   = await client.get('/cliente/12345');
 *   const result = await client.post('/facturas/pagar', { ids: ['F1','F2'] });
 *
 * No hay que pensar en headers, firmas ni tokens — el cliente los aplica solo.
 */

const axios  = require('axios');
const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const { getService } = require('./service.registry');
const logger = require('../../config/logger');

// Cache de instancias Axios por servicio
const _instances = new Map();

/**
 * Construye los headers de autenticación según el tipo configurado.
 * Para HMAC la firma se calcula en el interceptor de request (necesita el body).
 *
 * @param {object} auth - Configuración de auth del servicio
 * @returns {object} Headers estáticos (apikey, basic, none)
 */
const _staticAuthHeaders = (auth) => {
  switch (auth.type) {
    case 'apikey':
      return { [auth.header || 'X-Api-Key']: auth.key };

    case 'basic': {
      const encoded = Buffer.from(`${auth.user}:${auth.password}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }

    case 'jwt': {
      // JWT firmado con HS256 — válido por `expiry` (default 5m)
      const token = jwt.sign(
        { iss: 'botpay-center', iat: Math.floor(Date.now() / 1000) },
        auth.secret,
        { expiresIn: auth.expiry || '5m', algorithm: 'HS256' }
      );
      return { Authorization: `Bearer ${token}` };
    }

    case 'hmac':
    case 'none':
    default:
      return {};
  }
};

/**
 * Interceptor de request para HMAC — firma timestamp + body.
 * Formato: HMAC-SHA256(hex) de "<timestamp>\n<body_json>"
 *
 * @param {object} config  - Config de axios request
 * @param {object} auth    - Config de auth del servicio
 * @returns {object}       - Config modificada con header de firma
 */
const _applyHmac = (config, auth) => {
  const timestamp = Date.now().toString();
  const body      = config.data ? JSON.stringify(config.data) : '';
  const payload   = `${timestamp}\n${body}`;
  const signature = crypto.createHmac('sha256', auth.key).update(payload).digest('hex');

  config.headers = {
    ...config.headers,
    [auth.header || 'X-Signature']: signature,
    'X-Timestamp':                  timestamp,
  };
  return config;
};

/**
 * Crea (o devuelve desde caché) una instancia Axios lista para usar.
 *
 * @param {string} serviceId - ID del servicio en el registry
 * @returns {import('axios').AxiosInstance}
 */
const forService = (serviceId) => {
  const id = serviceId.toLowerCase();

  if (_instances.has(id)) return _instances.get(id);

  const config  = getService(id);
  const headers = {
    'Content-Type': 'application/json',
    Accept:         'application/json',
    ..._staticAuthHeaders(config.auth),
  };

  const instance = axios.create({
    baseURL: config.baseURL,
    timeout: config.timeout || 10_000,
    headers,
  });

  // Interceptor de request: aplica HMAC dinámico si corresponde
  if (config.auth.type === 'hmac') {
    instance.interceptors.request.use((reqConfig) => _applyHmac(reqConfig, config.auth));
  }

  // Interceptor de JWT: re-firma en cada request para evitar tokens vencidos
  if (config.auth.type === 'jwt') {
    instance.interceptors.request.use((reqConfig) => {
      const token = jwt.sign(
        { iss: 'botpay-center', iat: Math.floor(Date.now() / 1000) },
        config.auth.secret,
        { expiresIn: config.auth.expiry || '5m', algorithm: 'HS256' }
      );
      reqConfig.headers['Authorization'] = `Bearer ${token}`;
      return reqConfig;
    });
  }

  // Interceptor de response: log de errores con contexto del servicio
  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      const status  = err.response?.status;
      const message = err.response?.data?.message || err.message;
      logger.warn(`[SignedClient:${id}] ${status || 'NET_ERR'} — ${message}`);
      return Promise.reject(err);
    }
  );

  _instances.set(id, instance);
  logger.debug(`[SignedClient] Instancia creada para "${id}" → ${config.baseURL}`);
  return instance;
};

/**
 * Limpia la caché de instancias (útil en tests).
 */
const clearCache = () => _instances.clear();

module.exports = { for: forService, forService, clearCache };
