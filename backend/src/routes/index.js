const { Router } = require('express');
const healthRoutes    = require('./health.routes');
const webhookRoutes   = require('./webhook.routes');
const paycenterRoutes = require('./paycenter.routes');
const authRoutes      = require('./auth.routes');
const crmRoutes       = require('./crm.routes');
const testRoutes      = require('./test.routes');

const router = Router();

router.use('/health',    healthRoutes);
router.use('/webhook',   webhookRoutes);
router.use('/paycenter', paycenterRoutes);
router.use('/auth',      authRoutes);
router.use('/crm',       crmRoutes);

// Solo en desarrollo
if (process.env.NODE_ENV !== 'production') {
  router.use('/test', testRoutes);
}

module.exports = router;
