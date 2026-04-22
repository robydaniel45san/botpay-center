const { Sequelize } = require('sequelize');
const path = require('path');
const logger = require('./logger');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../data/botpay.db'),
  logging: (msg) => logger.debug(msg),
  define: {
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
});

const connectDB = async () => {
  await sequelize.authenticate();
  logger.info('Conexión a SQLite establecida correctamente');

  // Crear tablas automáticamente si no existen
  await sequelize.sync();
  logger.info('Tablas sincronizadas');
};

module.exports = { sequelize, connectDB };
