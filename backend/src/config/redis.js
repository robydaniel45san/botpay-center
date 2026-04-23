const { createClient } = require('redis');
const logger = require('./logger');

// Mock en memoria — para cuando Redis no está disponible
const store = new Map();
const mockClient = {
  async setEx(key, ttl, value) {
    store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  },
  async get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
    return entry.value;
  },
  async del(key) { store.delete(key); },
  async ping() { return 'PONG'; },
};

let client = mockClient;

const connectRedis = async () => {
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT || 6379;

  // Si no hay host configurado, usar mock en memoria
  if (!host || host === 'localhost' && process.env.NODE_ENV !== 'production') {
    try {
      // Intentar conexión real de todas formas
      const real = createClient({ socket: { host: host || 'localhost', port: parseInt(port) } });
      await real.connect();
      client = real;
      logger.info(`Redis conectado — ${host}:${port}`);
      return client;
    } catch {
      logger.warn('Redis no disponible — usando mock en memoria (sesiones no persisten entre reinicios)');
      client = mockClient;
      return client;
    }
  }

  // Producción o REDIS_HOST configurado: conexión obligatoria
  const real = createClient({ socket: { host, port: parseInt(port) } });
  real.on('error', (err) => logger.error('Redis error:', err.message));
  await real.connect();
  client = real;
  logger.info(`Redis conectado — ${host}:${port}`);
  return client;
};

const getRedis = () => client;

module.exports = { connectRedis, getRedis };
