require('dotenv').config();
const { httpServer, io } = require('./app');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { startReminderJobs } = require('./services/bot/reminder.service');
const { startQRPolling }   = require('./services/payment/qr-polling.service');
const logger = require('./config/logger');

// Exponer io globalmente para uso en callbacks (payment.callback.controller)
global._io = io;

// Cargar modelos para sync
require('./models/index');

const PORT = process.env.PORT || 4000;

const start = async () => {
  try {
    // Base de datos
    await connectDB();

    // Redis
    await connectRedis();

    // Cron jobs de recordatorios
    startReminderJobs();

    // Polling de estado de QRs contra PayCenter (cada 10s, sin necesitar su webhook)
    startQRPolling(io);

    // Servidor HTTP + Socket.io
    httpServer.listen(PORT, () => {
      logger.info(`BotPay Center corriendo en puerto ${PORT}`);
      logger.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    logger.error('Error al iniciar el servidor:', err);
    process.exit(1);
  }
};

// Manejo de errores no capturados
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException:', err);
  process.exit(1);
});

start();
