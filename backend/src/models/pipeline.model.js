const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Pipeline = sequelize.define('Pipeline', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING(300),
    allowNull: true,
  },
  is_default: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
  },
}, {
  tableName: 'pipeline',
});

const PipelineStage = sequelize.define('PipelineStage', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  pipeline_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  color: {
    type: DataTypes.STRING(7),
    defaultValue: '#6366f1',
  },
  is_closed_won: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Esta etapa significa "ganado/pagado"',
  },
  is_closed_lost: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'pipeline_stage',
});

const Deal = sequelize.define('Deal', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  pipeline_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  stage_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  contact_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  agent_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: true,
  },
  currency_code: {
    type: DataTypes.STRING(3),
    defaultValue: 'BOB',
  },
  status: {
    type: DataTypes.ENUM('open', 'won', 'lost'),
    defaultValue: 'open',
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  expected_close_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  closed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'deal',
});

module.exports = { Pipeline, PipelineStage, Deal };
