const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Contact = sequelize.define('Contact', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    comment: 'Número WhatsApp con código de país (ej: 59170000000)',
  },
  wa_id: {
    type: DataTypes.STRING(30),
    allowNull: true,
    comment: 'ID de WhatsApp asignado por Meta',
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  document_id: {
    type: DataTypes.STRING(30),
    allowNull: true,
    comment: 'CI / NIT / RUT del contacto',
  },
  avatar_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  // Vínculo con PayCenter
  paycenter_merchant_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'merchant.id en PayCenterProject',
  },
  // Estado y metadata
  status: {
    type: DataTypes.ENUM('active', 'blocked', 'unsubscribed'),
    defaultValue: 'active',
  },
  opt_in: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Consentimiento para recibir mensajes',
  },
  last_seen_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'contact',
});

module.exports = Contact;
