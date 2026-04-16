/**
 * Agente Watchdog
 * ───────────────
 * Monitorea en segundo plano:
 *   - Backend BotPay (health check propio)
 *   - PayCenter API
 *   - Tunnel cloudflared (verifica tráfico entrante)
 *
 * Si detecta caída → loguea error + emite alerta Socket.io al CRM.
 * Se inicia junto al servidor (startWatchdog) y corre cada INTERVAL ms.
 */

const axios = require('axios');
const logger = require('../../config/logger');

const INTERVAL_MS = 30_000; // 30 segundos

const SERVICES = [
  {
    name: 'BotPay Health',
    url: `http://localhost:${process.env.PORT || 4000}/api/health`,
    critical: true,
  },
  {
    name: 'PayCenter API',
    url: `${process.env.PAYCENTER_API_URL?.replace('/api/v1/bo', '')}/health`,
    critical: false,
  },
];

// Estado previo para detectar cambios (up→down o down→up)
const prevStatus = {};

/**
 * Verifica un servicio HTTP. Retorna { ok, latencyMs, error }.
 */
const checkService = async ({ url }) => {
  const start = Date.now();
  try {
    await axios.get(url, { timeout: 5000 });
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
};

/**
 * Verifica que cloudflared esté activo comprobando si el proceso existe.
 */
const checkTunnel = () => {
  try {
    const { execSync } = require('child_process');
    const out = execSync('pgrep -f cloudflared', { timeout: 3000 }).toString().trim();
    return { ok: !!out, pid: out };
  } catch {
    return { ok: false, pid: null };
  }
};

/**
 * Ejecuta un ciclo de verificación completo y emite alertas si hay cambios.
 */
const runCheck = async (io) => {
  // Verificar servicios HTTP
  for (const svc of SERVICES) {
    if (!svc.url || svc.url.includes('undefined')) continue;

    const result = await checkService(svc);
    const wasOk = prevStatus[svc.name] !== false; // true por defecto la primera vez

    if (!result.ok && wasOk) {
      // Servicio cayó
      logger.error(`[Watchdog] ❌ ${svc.name} — CAÍDO. Error: ${result.error}`);
      if (io) {
        io.emit('watchdog:alert', {
          service: svc.name,
          status: 'down',
          error: result.error,
          critical: svc.critical,
          timestamp: new Date().toISOString(),
        });
      }
    } else if (result.ok && prevStatus[svc.name] === false) {
      // Servicio se recuperó
      logger.info(`[Watchdog] ✅ ${svc.name} — RECUPERADO (${result.latencyMs}ms)`);
      if (io) {
        io.emit('watchdog:alert', {
          service: svc.name,
          status: 'up',
          latencyMs: result.latencyMs,
          critical: svc.critical,
          timestamp: new Date().toISOString(),
        });
      }
    } else if (result.ok) {
      logger.debug(`[Watchdog] ✅ ${svc.name} — OK (${result.latencyMs}ms)`);
    }

    prevStatus[svc.name] = result.ok;
  }

  // Verificar tunnel
  const tunnel = checkTunnel();
  const tunnelWasOk = prevStatus['Cloudflared Tunnel'] !== false;

  if (!tunnel.ok && tunnelWasOk) {
    logger.warn('[Watchdog] ⚠️ Cloudflared Tunnel — NO ACTIVO. Webhook de Meta no funcionará.');
    if (io) {
      io.emit('watchdog:alert', {
        service: 'Cloudflared Tunnel',
        status: 'down',
        error: 'Proceso cloudflared no encontrado',
        critical: false,
        timestamp: new Date().toISOString(),
      });
    }
  } else if (tunnel.ok && prevStatus['Cloudflared Tunnel'] === false) {
    logger.info(`[Watchdog] ✅ Cloudflared Tunnel — ACTIVO (PID ${tunnel.pid})`);
    if (io) {
      io.emit('watchdog:alert', {
        service: 'Cloudflared Tunnel',
        status: 'up',
        timestamp: new Date().toISOString(),
      });
    }
  }

  prevStatus['Cloudflared Tunnel'] = tunnel.ok;
};

/**
 * Inicia el agente watchdog. Llamar desde server.js.
 * @param {import('socket.io').Server} io
 */
const startWatchdog = (io) => {
  logger.info('[Watchdog] Agente de monitoreo activo (cada 30s)');

  // Primera verificación inmediata
  runCheck(io);

  // Ciclo continuo
  setInterval(() => runCheck(io), INTERVAL_MS);
};

module.exports = { startWatchdog };
