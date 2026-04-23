const { Sequelize } = require('sequelize');
const logger = require('./logger');

const sequelize = new Sequelize({
  dialect:  'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'botpay_db',
  username: process.env.DB_USER     || 'botpay',
  password: process.env.DB_PASSWORD || '',
  logging:  (msg) => logger.debug(msg),
  define: {
    underscored: true,
    timestamps:  true,
    createdAt:   'created_at',
    updatedAt:   'updated_at',
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle:    10000,
  },
});

const connectDB = async () => {
  await sequelize.authenticate();
  logger.info(`BD PostgreSQL conectada — ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
};

module.exports = { sequelize, connectDB };
