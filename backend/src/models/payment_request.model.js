const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Registro de QRs generados desde el bot, ligados a PayCenter
const PaymentRequest = sequelize.define('PaymentRequest', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  contact_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  // Referencia en PayCenter
  paycenter_qr_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'qr.id en PayCenterProject',
  },
  paycenter_transaction_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'transaction.id en PayCenterProject',
  },
  paycenter_order_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  // Datos del cobro
  amount: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false,
  },
  currency_code: {
    type: DataTypes.STRING(3),
    defaultValue: 'BOB',
  },
  description: {
    type: DataTypes.STRING(300),
    allowNull: true,
  },
  bank_code: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'bmsc | bnb | bisa',
  },
  // Estado del pago
  status: {
    type: DataTypes.ENUM('pending', 'qr_generated', 'paid', 'expired', 'cancelled', 'error'),
    defaultValue: 'pending',
  },
  // El QR en base64 para reenviar si es necesario
  qr_base64: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  qr_sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Cuándo se envió el QR al cliente por WhatsApp',
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  expired_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Datos del pagador (llegan desde PayCenter callback)
  payer_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  payer_bank: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  voucher_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
}, {
  tableName: 'payment_request',
});

module.exports = PaymentRequest;
