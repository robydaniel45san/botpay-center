const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Citas agendadas por los clientes vía WhatsApp bot.
 */
const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  contact_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  service_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  agent_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'Empleado/profesional asignado (si aplica)',
  },
  // Fecha y hora
  appointment_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  start_time: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  end_time: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  // Estado de la cita
  status: {
    type: DataTypes.ENUM(
      'pending',         // esperando confirmación/pago
      'confirmed',       // confirmada
      'pending_payment', // requiere pago anticipado
      'paid',            // pagó el anticipo
      'completed',       // se realizó el servicio
      'cancelled',       // cancelada por el cliente
      'no_show',         // no se presentó
      'rescheduled'      // reagendada
    ),
    defaultValue: 'pending',
  },
  // Notas
  client_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Notas del cliente al agendar',
  },
  internal_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Notas internas del agente',
  },
  // Pago anticipado
  payment_request_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Referencia al QR generado para pago anticipado',
  },
  // Recordatorios
  reminder_24h_sent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  reminder_1h_sent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  // Confirmación
  confirmed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  cancelled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  cancellation_reason: {
    type: DataTypes.STRING(300),
    allowNull: true,
  },
}, {
  tableName: 'appointment',
});

module.exports = Appointment;
