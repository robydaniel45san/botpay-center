require('dotenv').config();
const { sequelize, connectDB } = require('../config/database');
const models = require('../models/index');
const logger = require('../config/logger');

const migrate = async () => {
  try {
    await connectDB();

    // sync({ force: false }) crea tablas si no existen, sin borrar datos
    await sequelize.sync({ alter: true });

    logger.info('Migración completada — todas las tablas sincronizadas');
    process.exit(0);
  } catch (err) {
    logger.error('Error en migración:', err);
    process.exit(1);
  }
};

migrate();
