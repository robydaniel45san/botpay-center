const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Catálogo de servicios que ofrece el negocio.
 * Ej: Corte de cabello, Manicure, Consulta médica, Clase de gym, etc.
 */
const Service = sequelize.define('Service', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
    comment: 'Nombre visible al cliente en WhatsApp',
  },
  description: {
    type: DataTypes.STRING(400),
    allowNull: true,
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60,
    comment: 'Duración en minutos para bloquear el slot',
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Precio del servicio (null = precio a convenir)',
  },
  currency_code: {
    type: DataTypes.STRING(3),
    defaultValue: 'BOB',
  },
  requires_advance_payment: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Si requiere pago anticipado para confirmar la cita',
  },
  advance_payment_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Monto del anticipo (si null, usa el precio completo)',
  },
  category: {
    type: DataTypes.STRING(80),
    allowNull: true,
    comment: 'Categoría para agrupar en el menú del bot',
  },
  emoji: {
    type: DataTypes.STRING(10),
    allowNull: true,
    defaultValue: '✂️',
    comment: 'Emoji para mostrar en WhatsApp',
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'service',
});

module.exports = Service;
