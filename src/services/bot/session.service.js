const { getRedis } = require('../../config/redis');
const { BotSession } = require('../../models/index');
const logger = require('../../config/logger');

const SESSION_TTL     = 60 * 30; // 30 minutos en segundos
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos en ms
const KEY = (conversationId) => `bot:session:${conversationId}`;

/**
 * Obtiene la sesión del bot desde Redis (rápido) o DB (fallback).
 * La sesión contiene el flujo actual, paso y contexto acumulado.
 */
const getSession = async (conversationId) => {
  try {
    const redis = getRedis();
    const cached = await redis.get(KEY(conversationId));
    if (cached) return JSON.parse(cached);
  } catch (err) {
    logger.warn('Redis getSession falló, usando DB:', err.message);
  }

  // Fallback a DB
  const record = await BotSession.findOne({ where: { conversation_id: conversationId } });
  if (!record) return null;

  const session = {
    conversationId,
    contactId: record.contact_id,
    currentFlow: record.current_flow,
    currentStep: record.current_step,
    context: record.context || {},
    retryCount: record.retry_count || 0,
  };

  // Re-cachear en Redis
  try {
    const redis = getRedis();
    await redis.setEx(KEY(conversationId), SESSION_TTL, JSON.stringify(session));
  } catch {}

  return session;
};

/**
 * Actualiza la sesión en Redis y persiste en DB.
 */
const updateSession = async (conversationId, updates) => {
  const current = await getSession(conversationId) || {
    conversationId,
    context: {},
    retryCount: 0,
  };

  const updated = {
    ...current,
    ...updates,
    context: { ...current.context, ...(updates.context || {}) },
    lastInteractionAt: new Date().toISOString(),
  };

  // Redis
  try {
    const redis = getRedis();
    await redis.setEx(KEY(conversationId), SESSION_TTL, JSON.stringify(updated));
  } catch (err) {
    logger.warn('Redis updateSession falló:', err.message);
  }

  // DB (async, no bloquea)
  BotSession.update(
    {
      current_flow: updated.currentFlow || null,
      current_step: updated.currentStep || null,
      context: updated.context,
      retry_count: updated.retryCount || 0,
      last_interaction_at: new Date(),
    },
    { where: { conversation_id: conversationId } }
  ).catch((err) => logger.warn('BotSession DB update falló:', err.message));

  return updated;
};

/**
 * Reinicia la sesión (después de completar un flujo o por timeout).
 */
const resetSession = async (conversationId) => {
  return updateSession(conversationId, {
    currentFlow: null,
    currentStep: null,
    context: {},
    retryCount: 0,
  });
};

/**
 * Incrementa el contador de reintentos.
 * Útil para limitar loops cuando el usuario manda mensajes inválidos.
 */
const incrementRetry = async (conversationId) => {
  const session = await getSession(conversationId) || { retryCount: 0 };
  return updateSession(conversationId, { retryCount: (session.retryCount || 0) + 1 });
};

module.exports = { getSession, updateSession, resetSession, incrementRetry, SESSION_TIMEOUT };
