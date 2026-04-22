const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Conversation = sequelize.define('Conversation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  contact_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  agent_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'Agente asignado actualmente',
  },
  // Estado del flujo
  status: {
    type: DataTypes.ENUM('open', 'bot', 'pending', 'resolved', 'expired'),
    defaultValue: 'bot',
    comment: 'bot=manejado por bot, open=asignado a agente, pending=sin asignar',
  },
  // Canal y referencia
  channel: {
    type: DataTypes.ENUM('whatsapp'),
    defaultValue: 'whatsapp',
  },
  // Contexto del bot
  bot_flow: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Flujo activo del bot (welcome, payment, status, etc.)',
  },
  bot_step: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Paso actual dentro del flujo',
  },
  bot_paused: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Bot pausado por handoff a agente',
  },
  // Contadores
  unread_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_message_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_message_preview: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Metadata
  subject: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium',
  },
}, {
  tableName: 'conversation',
});

module.exports = Conversation;
