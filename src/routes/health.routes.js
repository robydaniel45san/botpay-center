const { Router } = require('express');
const { sequelize } = require('../config/database');
const { getRedis } = require('../config/redis');

const router = Router();

router.get('/', async (req, res) => {
  const checks = { api: 'ok', database: 'unknown', redis: 'unknown' };

  try {
    await sequelize.authenticate();
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  try {
    const redis = getRedis();
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');

  res.status(allOk ? 200 : 503).json({
    success: allOk,
    service: 'botpay-center',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  });
});

module.exports = router;
