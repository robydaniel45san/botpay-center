/**
 * qr-polling.service.js — Sincronización activa de estado de QRs
 *
 * BotPay no depende del callback de PayCenter (que requeriría configurar
 * una URL en la DB de PayCenter). En su lugar, BotPay consulta activamente
 * el estado de cada QR pendiente cada N segundos.
 *
 * Flujo:
 *   1. Busca todos los PaymentRequest con status='qr_generated'
 *   2. Consulta getStatus(gatewayId) para cada uno
 *   3. Si cambió a 'paid' → actualiza DB + emite Socket.io → bot notifica al cliente
 *   4. Si cambió a 'expired' → actualiza DB + emite evento
 */

const cron    = require('node-cron');
const { Op }  = require('sequelize');
const { PaymentRequest, Conversation, Contact } = require('../../models/index');
const paymentAdapter = require('../../infrastructure/paycenter/paycenter.adapter');
const logger  = require('../../config/logger');

let _io = null;

const processQR = async (pr) => {
  try {
    const result = await paymentAdapter.getStatus(pr.paycenter_qr_id);

    if (result.status === pr.status) return; // sin cambio

    const updates = { status: result.status };

    if (result.status === 'paid') {
      updates.paid_at    = new Date();
      updates.payer_name = result.payerName;
      updates.payer_bank = result.payerBank;
      updates.voucher_id = result.voucherId;
    }

    await pr.update(updates);
    logger.info(`[QRPolling] PaymentRequest ${pr.id} → ${result.status}`);

    // Emitir evento en tiempo real al CRM
    if (_io) {
      _io.to(`conversation:${pr.conversation_id}`).emit(
        result.status === 'paid' ? 'payment_received' : 'payment_expired',
        { conversationId: pr.conversation_id, paymentRequestId: pr.id, status: result.status }
      );
    }

  } catch (err) {
    logger.warn(`[QRPolling] Error procesando PR ${pr.id}:`, err.message);
  }
};

const runPoll = async () => {
  try {
    const pending = await PaymentRequest.findAll({
      where: {
        status: 'qr_generated',
        paycenter_qr_id: { [Op.not]: null },
        // Solo QRs que no hayan vencido según BotPay (margen de 5min extra)
        [Op.or]: [
          { expired_at: null },
          { expired_at: { [Op.gt]: new Date(Date.now() - 5 * 60 * 1000) } },
        ],
      },
    });

    if (pending.length === 0) return;

    logger.debug(`[QRPolling] Verificando ${pending.length} QR(s) activos`);
    await Promise.allSettled(pending.map(processQR));

  } catch (err) {
    logger.error('[QRPolling] Error en ciclo de polling:', err.message);
  }
};

/**
 * Inicia el servicio de polling.
 * @param {import('socket.io').Server} io
 */
const startQRPolling = (io) => {
  _io = io;
  // Cada 10 segundos
  cron.schedule('*/10 * * * * *', runPoll);
  logger.info('[QRPolling] Servicio de polling activo (cada 10s)');
};

module.exports = { startQRPolling };
