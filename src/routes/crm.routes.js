const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');

const contactCtrl      = require('../controllers/crm/contact.crm.controller');
const conversationCtrl = require('../controllers/crm/conversation.crm.controller');
const agentCtrl        = require('../controllers/crm/agent.crm.controller');
const pipelineCtrl     = require('../controllers/crm/pipeline.crm.controller');
const reportCtrl       = require('../controllers/crm/report.crm.controller');
const serviceCtrl      = require('../controllers/crm/service.crm.controller');
const appointmentCtrl  = require('../controllers/crm/appointment.crm.controller');
const scheduleCtrl     = require('../controllers/crm/schedule.crm.controller');
const paymentCtrl      = require('../controllers/crm/payment.crm.controller');
const qrCtrl           = require('../controllers/crm/qr.crm.controller');

const router = Router();
router.use(authenticate);

// ── CONTACTOS ──────────────────────────────────────────────────────────────
router.get   ('/contacts',                    contactCtrl.list);
router.post  ('/contacts',                    contactCtrl.create);
router.get   ('/contacts/:id',                contactCtrl.getById);
router.patch ('/contacts/:id',                contactCtrl.update);
router.delete('/contacts/:id',                contactCtrl.remove);
router.get   ('/contacts/:id/messages',       contactCtrl.getMessages);
router.get   ('/contacts/:id/payments',       contactCtrl.getPayments);
router.get   ('/contacts/:id/appointments',   contactCtrl.getAppointments);
router.post  ('/contacts/:id/tags',           contactCtrl.assignTag);

// ── CONVERSACIONES ─────────────────────────────────────────────────────────
router.get   ('/conversations',               conversationCtrl.inbox);
router.get   ('/conversations/:id',           conversationCtrl.getById);
router.post  ('/conversations/:id/assign',    conversationCtrl.assign);
router.post  ('/conversations/:id/close',     conversationCtrl.close);
router.post  ('/conversations/:id/bot-resume',conversationCtrl.resumeBot);
router.post  ('/conversations/:id/messages',  conversationCtrl.sendMessage);
router.post  ('/conversations/:id/qr',        qrCtrl.generateQR);

// ── AGENTES ────────────────────────────────────────────────────────────────
router.get   ('/agents',                       agentCtrl.list);
router.post  ('/agents',                       requireRole('admin'), agentCtrl.create);
router.get   ('/agents/:id',                   agentCtrl.getById);
router.patch ('/agents/:id',                   requireRole('admin', 'supervisor'), agentCtrl.update);
router.delete('/agents/:id',                   requireRole('admin'), agentCtrl.remove);
router.patch ('/agents/:id/password',          requireRole('admin'), agentCtrl.changePassword);
router.get   ('/agents/:id/stats',             agentCtrl.getStats);

// ── SERVICIOS (catálogo del negocio) ───────────────────────────────────────
router.get   ('/services',                     serviceCtrl.list);
router.post  ('/services',                     requireRole('admin', 'supervisor'), serviceCtrl.create);
router.get   ('/services/:id',                 serviceCtrl.getById);
router.patch ('/services/:id',                 requireRole('admin', 'supervisor'), serviceCtrl.update);
router.delete('/services/:id',                 requireRole('admin'), serviceCtrl.remove);

// ── CITAS ──────────────────────────────────────────────────────────────────
router.get   ('/appointments',                 appointmentCtrl.list);
router.get   ('/appointments/:id',             appointmentCtrl.getById);
router.patch ('/appointments/:id',             appointmentCtrl.update);
router.delete('/appointments/:id',             appointmentCtrl.cancel);

// ── HORARIOS ───────────────────────────────────────────────────────────────
router.get   ('/schedule',                     scheduleCtrl.getSchedule);
router.put   ('/schedule',                     requireRole('admin', 'supervisor'), scheduleCtrl.saveSchedule);
router.get   ('/schedule/blocks',              scheduleCtrl.getBlocks);
router.post  ('/schedule/blocks',              requireRole('admin', 'supervisor'), scheduleCtrl.createBlock);
router.delete('/schedule/blocks/:id',          requireRole('admin', 'supervisor'), scheduleCtrl.deleteBlock);

// ── PAGOS ──────────────────────────────────────────────────────────────────
router.get   ('/payments',                     paymentCtrl.list);
router.get   ('/payments/:id',                 paymentCtrl.getById);
router.post  ('/payments/:id/sync',            paymentCtrl.syncStatus);

// ── PIPELINE / DEALS ───────────────────────────────────────────────────────
router.get   ('/pipelines',                    pipelineCtrl.listPipelines);
router.post  ('/pipelines',                    requireRole('admin'), pipelineCtrl.createPipeline);
router.get   ('/pipelines/:pipelineId/deals',  pipelineCtrl.getPipelineDeals);
router.post  ('/deals',                        pipelineCtrl.createDeal);
router.get   ('/deals/:id',                    pipelineCtrl.getDeal);
router.patch ('/deals/:id',                    pipelineCtrl.moveDeal);
router.delete('/deals/:id',                    pipelineCtrl.removeDeal);

// ── TAGS ───────────────────────────────────────────────────────────────────
router.get   ('/tags',                         pipelineCtrl.listTags);
router.post  ('/tags',                         requireRole('admin', 'supervisor'), pipelineCtrl.createTag);
router.patch ('/tags/:id',                     requireRole('admin', 'supervisor'), pipelineCtrl.updateTag);
router.delete('/tags/:id',                     requireRole('admin'), pipelineCtrl.deleteTag);

// ── REPORTES ───────────────────────────────────────────────────────────────
router.get   ('/reports/payments',             reportCtrl.paymentsReport);
router.get   ('/reports/conversations',        reportCtrl.conversationsReport);
router.get   ('/reports/appointments',         reportCtrl.appointmentsReport);
router.get   ('/reports/agents',               reportCtrl.agentsReport);

module.exports = router;
