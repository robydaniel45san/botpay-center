const { Router } = require('express');
const { handlePaymentCallback } = require('../controllers/payment.callback.controller');

const router = Router();

/**
 * POST /api/paycenter/payment-callback
 *
 * PayCenterProject llama este endpoint al confirmar un pago.
 * Seguridad: header X-Callback-Secret debe coincidir con PAYCENTER_CALLBACK_SECRET.
 * En desarrollo sin secret configurado, se permite pasar (mock).
 */
router.post('/payment-callback', (req, res, next) => {
  const secret   = req.headers['x-callback-secret'];
  const expected = process.env.PAYCENTER_CALLBACK_SECRET;

  // Si hay secret configurado, siempre validar (dev y prod)
  if (expected && secret !== expected) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  next();
}, handlePaymentCallback);

module.exports = router;
