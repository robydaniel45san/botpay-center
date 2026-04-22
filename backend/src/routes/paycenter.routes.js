const { Router } = require('express');
const { handlePaymentCallback } = require('../controllers/payment.callback.controller');

const router = Router();

/**
 * POST /api/paycenter/payment-callback
 *
 * PayCenterProject llama este endpoint al confirmar un pago.
 * Se debe configurar en PayCenter como callback_url del banco
 * o como webhook post-transacción en el central.
 *
 * Seguridad: validar que el request venga de PayCenter
 * usando el header X-PayCenter-Secret (mismo JWT_SECRET compartido).
 */
router.post('/payment-callback', (req, res, next) => {
  // Validación básica del secret compartido
  const secret = req.headers['x-paycenter-secret'];
  const expected = process.env.PAYCENTER_JWT_SECRET || process.env.JWT_SECRET;

  if (process.env.NODE_ENV === 'production' && secret !== expected) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  next();
}, handlePaymentCallback);

module.exports = router;
