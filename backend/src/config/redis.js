const logger = require('./logger');

// Mock en memoria — reemplaza Redis para desarrollo local sin servidor
const store = new Map();

const client = {
  async setEx(key, ttl, value) {
    store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  },
  async get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
    return entry.value;
  },
  async del(key) {
    store.delete(key);
  },
  async ping() {
    return 'PONG';
  },
};

const connectRedis = async () => {
  logger.info('Redis mock en memoria activo (modo local)');
  return client;
};

const getRedis = () => client;

module.exports = { connectRedis, getRedis };
