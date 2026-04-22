const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Agent = sequelize.define('Agent', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('admin', 'supervisor', 'agent'),
    defaultValue: 'agent',
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'on_vacation'),
    defaultValue: 'active',
  },
  avatar_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  // Para disponibilidad en tiempo real
  is_online: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  max_conversations: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    comment: 'Máximo de conversaciones simultáneas',
  },
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'agent',
});

module.exports = Agent;
