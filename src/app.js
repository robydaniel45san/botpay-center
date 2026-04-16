require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const { createServer } = require('http');
const { Server } = require('socket.io');

const logger = require('./config/logger');
const routes = require('./routes/index');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const httpServer = createServer(app);

// ── Socket.io ──────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:4001',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Middleware de autenticación para Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('auth:required'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.agent = decoded;
    next();
  } catch {
    next(new Error('auth:invalid'));
  }
});

app.set('io', io);

// Mapa agentId → Set de socketIds (para saber cuántos tabs tiene abiertos)
const agentSockets = new Map();

io.on('connection', (socket) => {
  const agentId = socket.agent?.id;
  if (agentId) {
    if (!agentSockets.has(agentId)) agentSockets.set(agentId, new Set());
    agentSockets.get(agentId).add(socket.id);

    // Unirse a sala personal del agente
    socket.join(`agent:${agentId}`);

    // Notificar a todos que el agente está online (si es la primera conexión)
    if (agentSockets.get(agentId).size === 1) {
      io.emit('agent:online', { agentId, name: socket.agent.name });
      logger.info(`Agente online: ${socket.agent.name} (${socket.id})`);
    }
  }

  // ── Rooms de conversación ──
  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation:${conversationId}`);
    logger.info(`Socket ${socket.id} unido a conversation:${conversationId}`);
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
  });

  // ── Indicador de escritura ──
  socket.on('agent_typing', ({ conversationId, typing }) => {
    socket.to(`conversation:${conversationId}`).emit('agent_typing', {
      agentId,
      agentName: socket.agent?.name,
      typing: !!typing,
    });
  });

  // ── Desconexión ──
  socket.on('disconnect', (reason) => {
    if (agentId && agentSockets.has(agentId)) {
      agentSockets.get(agentId).delete(socket.id);

      // Offline solo si ya no tiene sockets activos
      if (agentSockets.get(agentId).size === 0) {
        agentSockets.delete(agentId);
        io.emit('agent:offline', { agentId, name: socket.agent?.name });
        logger.info(`Agente offline: ${socket.agent?.name} — motivo: ${reason}`);
      }
    }
  });
});

// ── Seguridad y parsing ────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4001',
  credentials: true,
}));

// Webhook de Meta necesita el body raw para verificar firma
app.use('/api/webhook/whatsapp', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging HTTP ───────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ── Rutas ──────────────────────────────────────────────
app.use('/api', routes);

// ── Errores ────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app, httpServer, io };
