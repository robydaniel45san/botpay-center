const { Router } = require('express');
const { verifyWebhook, receiveWebhook } = require('../controllers/webhook.controller');

const router = Router();

/**
 * GET /api/webhook/whatsapp
 * Handshake de verificación de Meta.
 * Meta llama este endpoint al registrar el webhook en el panel de desarrolladores.
 */
router.get('/whatsapp', verifyWebhook);

/**
 * POST /api/webhook/whatsapp
 * Recibe mensajes y actualizaciones de estado desde Meta.
 * El body llega como Buffer (express.raw) para verificar la firma HMAC.
 */
router.post('/whatsapp', receiveWebhook);

module.exports = router;
