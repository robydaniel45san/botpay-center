const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Almacena el estado temporal del bot en Redis,
// pero este modelo persiste el último estado conocido en DB
const BotSession = sequelize.define('BotSession', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
  },
  contact_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  // Flujo actual
  current_flow: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'welcome | payment | status | handoff',
  },
  current_step: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  // Datos recolectados durante el flujo (monto, banco, etc.)
  context: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Datos temporales del flujo: {amount, bank, qr_id, etc.}',
  },
  // Reintentos
  retry_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  // Estado
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_interaction_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'bot_session',
});

module.exports = BotSession;
