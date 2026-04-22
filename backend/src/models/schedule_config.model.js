const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Configuración de horarios del negocio.
 * Define los días y horas en que se pueden agendar citas.
 */
const ScheduleConfig = sequelize.define('ScheduleConfig', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  day_of_week: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: '0=Domingo, 1=Lunes, ..., 6=Sábado',
  },
  is_open: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  open_time: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: 'Hora de apertura ej: 08:00:00',
  },
  close_time: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: 'Hora de cierre ej: 18:00:00',
  },
  slot_duration_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 30,
    comment: 'Granularidad de slots disponibles',
  },
  break_start: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: 'Inicio de descanso ej: 12:00:00',
  },
  break_end: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: 'Fin de descanso ej: 13:00:00',
  },
}, {
  tableName: 'schedule_config',
});

/**
 * Días bloqueados (feriados, vacaciones, cierre especial).
 */
const ScheduleBlock = sequelize.define('ScheduleBlock', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  reason: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  block_type: {
    type: DataTypes.ENUM('full_day', 'partial'),
    defaultValue: 'full_day',
  },
  start_time: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  end_time: {
    type: DataTypes.TIME,
    allowNull: true,
  },
}, {
  tableName: 'schedule_block',
});

module.exports = { ScheduleConfig, ScheduleBlock };
