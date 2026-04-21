/**
 * service.registry.js — Registro centralizado de servicios externos
 *
 * Cada empresa/servicio externo (SAGUAPAC, ELFEC, SIN, etc.) tiene una entrada aquí
 * con su URL base y método de autenticación.
 *
 * Al agregar un nuevo servicio:
 *   1. Añadir una entrada en REGISTRY con su auth config
 *   2. Usar signedClient.for('nuevo_id') donde necesites llamarlo
 *   ✅ No hay que escribir ninguna firma o auth manual
 *
 * Tipos de auth soportados:
 *   - 'apikey'  → Header: X-Api-Key: <key>
 *   - 'hmac'    → Header: X-Signature: HMAC-SHA256(timestamp+body, secret)
 *   - 'jwt'     → Header: Authorization: Bearer <jwt>
 *   - 'basic'   → Header: Authorization: Basic base64(user:pass)
 *   - 'none'    → Sin autenticación
 */

const REGISTRY = {
  // ─── SERVICIOS DE AGUA ──────────────────────────────────────────────────
  saguapac: {
    name:    'SAGUAPAC Cochabamba',
    baseURL: process.env.SAGUAPAC_URL || 'http://localhost:3500/api/v1',
    auth: {
      type:   process.env.SAGUAPAC_AUTH_TYPE || 'apikey',
      key:    process.env.SAGUAPAC_API_KEY   || 'dev-mock-key-saguapac',
      header: 'X-Api-Key',
    },
    timeout: 10_000,
  },

  semapa: {
    name:    'SEMAPA Cochabamba',
    baseURL: process.env.SEMAPA_URL || 'https://api.semapa.gob.bo/v1',
    auth: {
      type:   'apikey',
      key:    process.env.SEMAPA_API_KEY || '',
      header: 'X-Api-Key',
    },
    timeout: 15_000,
  },

  // ─── SERVICIOS DE ELECTRICIDAD ──────────────────────────────────────────
  elfec: {
    name:    'ELFEC Cochabamba',
    baseURL: process.env.ELFEC_URL || 'https://api.elfec.bo/servicios/v2',
    auth: {
      type:   'hmac',
      key:    process.env.ELFEC_HMAC_KEY || 'dev-mock-secret-elfec',
      header: 'X-Signature',
    },
    timeout: 12_000,
  },

  cre: {
    name:    'CRE Santa Cruz',
    baseURL: process.env.CRE_URL || 'https://webservice.cre.com.bo/api',
    auth: {
      type:     'basic',
      user:     process.env.CRE_USER || '',
      password: process.env.CRE_PASS || '',
    },
    timeout: 12_000,
  },

  // ─── TELECOMUNICACIONES ─────────────────────────────────────────────────
  entel: {
    name:    'ENTEL Bolivia',
    baseURL: process.env.ENTEL_URL || 'https://api.entel.bo/partners/v1',
    auth: {
      type:   'jwt',
      secret: process.env.ENTEL_JWT_SECRET || 'dev-mock-jwt-entel',
      expiry: '5m',
    },
    timeout: 10_000,
  },

  tigo: {
    name:    'Tigo Bolivia',
    baseURL: process.env.TIGO_URL || 'https://api.tigo.com.bo/v1',
    auth: {
      type:   'apikey',
      key:    process.env.TIGO_API_KEY || '',
      header: 'X-Api-Key',
    },
    timeout: 10_000,
  },

  viva: {
    name:    'Viva Bolivia',
    baseURL: process.env.VIVA_URL || 'https://api.vivabo.com.bo/v1',
    auth: {
      type:   'apikey',
      key:    process.env.VIVA_API_KEY || '',
      header: 'Authorization',
    },
    timeout: 10_000,
  },

  // ─── IMPUESTOS Y TASAS ──────────────────────────────────────────────────
  gamc: {
    name:    'GAMC Cochabamba',
    baseURL: process.env.GAMC_URL || 'https://api.cochabamba.bo/recaudaciones/v1',
    auth: {
      type:   'apikey',
      key:    process.env.GAMC_API_KEY || '',
      header: 'X-Api-Key',
    },
    timeout: 15_000,
  },

  sin: {
    name:    'SIN Bolivia',
    baseURL: process.env.SIN_URL || 'https://servicios.impuestos.gob.bo/api/v1',
    auth: {
      type:   'hmac',
      key:    process.env.SIN_HMAC_KEY || '',
      header: 'X-Signature',
    },
    timeout: 20_000,
  },

  // ─── EDUCACIÓN ──────────────────────────────────────────────────────────
  ucb: {
    name:    'UCB Cochabamba',
    baseURL: process.env.UCB_URL || 'https://pagos.ucbcba.edu.bo/api',
    auth: {
      type:   'apikey',
      key:    process.env.UCB_API_KEY || '',
      header: 'X-Api-Key',
    },
    timeout: 12_000,
  },

  umss: {
    name:    'UMSS',
    baseURL: process.env.UMSS_URL || 'https://pagos.umss.edu.bo/api/v1',
    auth: {
      type:   'none',
      key:    process.env.UMSS_API_KEY || '',
    },
    timeout: 12_000,
  },
};

/**
 * Obtiene la configuración de un servicio del registro.
 * @param {string} serviceId - ID del servicio (ej: 'saguapac', 'elfec')
 * @returns {object} Config del servicio
 * @throws {Error} Si el servicio no está registrado
 */
const getService = (serviceId) => {
  const config = REGISTRY[serviceId.toLowerCase()];
  if (!config) {
    throw new Error(`[ServiceRegistry] Servicio no registrado: "${serviceId}". ` +
      `Servicios disponibles: ${Object.keys(REGISTRY).join(', ')}`);
  }
  return config;
};

/**
 * Lista todos los IDs de servicios registrados.
 * @returns {string[]}
 */
const listServices = () => Object.keys(REGISTRY);

/**
 * Verifica si un servicio está registrado.
 * @param {string} serviceId
 * @returns {boolean}
 */
const hasService = (serviceId) => serviceId.toLowerCase() in REGISTRY;

module.exports = { getService, listServices, hasService, REGISTRY };
