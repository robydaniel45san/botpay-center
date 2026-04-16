const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  // Quién envía
  direction: {
    type: DataTypes.ENUM('inbound', 'outbound'),
    allowNull: false,
    comment: 'inbound=del cliente, outbound=del bot/agente',
  },
  sender_type: {
    type: DataTypes.ENUM('contact', 'bot', 'agent'),
    allowNull: false,
  },
  sender_id: {
    type: DataTypes.STRING(30),
    allowNull: true,
    comment: 'contact.id, agent.id o "bot"',
  },
  // Contenido
  type: {
    type: DataTypes.ENUM('text', 'image', 'audio', 'video', 'document', 'location', 'template', 'interactive', 'sticker', 'reaction'),
    defaultValue: 'text',
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Texto del mensaje',
  },
  media_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  media_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'ID de media en Meta',
  },
  media_mime_type: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  // Referencias Meta
  wa_message_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: 'wamid.xxx de Meta',
  },
  // Estado de entrega
  status: {
    type: DataTypes.ENUM('pending', 'sent', 'delivered', 'read', 'failed'),
    defaultValue: 'pending',
  },
  error_message: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  // Respuesta a
  reply_to_wa_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  // Metadata adicional (botones, listas, etc.)
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'message',
  updatedAt: false,
});

module.exports = Message;
