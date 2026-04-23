const { Router } = require('express');
const healthRoutes    = require('./health.routes');
const webhookRoutes   = require('./webhook.routes');
const paycenterRoutes = require('./paycenter.routes');
const authRoutes      = require('./auth.routes');
const crmRoutes       = require('./crm.routes');

const router = Router();

router.use('/health',    healthRoutes);
router.use('/webhook',   webhookRoutes);
router.use('/paycenter', paycenterRoutes);
router.use('/auth',      authRoutes);
router.use('/crm',       crmRoutes);

module.exports = router;
