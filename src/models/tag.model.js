const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Tag = sequelize.define('Tag', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  color: {
    type: DataTypes.STRING(7),
    defaultValue: '#6366f1',
    comment: 'Color HEX para el badge en CRM',
  },
  description: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
}, {
  tableName: 'tag',
});

const ContactTag = sequelize.define('ContactTag', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  contact_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  tag_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
}, {
  tableName: 'contact_tag',
});

module.exports = { Tag, ContactTag };
