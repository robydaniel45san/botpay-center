/**
 * qr-polling.service.js — Monitor QR (Agente Monitor)
 *
 * Verifica activamente el estado de los QRs pendientes contra PayCenter.
 * Cuando detecta un cambio (paid / expired):
 *   1. Actualiza la BD (PaymentRequest)
 *   2. Emite evento Socket.io al CRM en tiempo real
 *   3. Notifica al cliente por WhatsApp via bot.engine
 *   4. Marca la conversación como resuelta (si es pago exitoso)
 *
 * Estrategia de polling:
 *   - Intervalo normal: cada 10s
 *   - Si no hay QRs activos: duerme y no consume recursos
 *   - Reintento silencioso si PayCenter no responde (no crashea)
 */

const cron              = require('node-cron');
const { Op }            = require('sequelize');
const { PaymentRequest, Conversation, Contact } = require('../../models/index');
const paymentAdapter    = require('../../infrastructure/paycenter/paycenter.adapter');
const botEngine         = require('../bot/bot.engine');
const logger            = require('../../config/logger');

let _io          = null;
let _activeCount = 0; // métricas básicas

/**
 * Procesa un PaymentRequest individual.
 * Consulta PayCenter y actúa según el nuevo estado.
 */
const processQR = async (pr) => {
  try {
    const result = await paymentAdapter.getStatus(pr.paycenter_qr_id);

    // Sin cambio de estado → nada que hacer
    if (result.status === pr.status) return;

    logger.info(`[MonitorQR] PR ${pr.id}: ${pr.status} → ${result.status}`);

    // ── Actualizar BD ─────────────────────────────────
    const updates = { status: result.status };

    if (result.status === 'paid') {
      updates.paid_at    = new Date();
      updates.payer_name = result.payerName;
      updates.payer_bank = result.payerBank;
      updates.voucher_id = result.voucherId;
    }

    if (result.status === 'expired') {
      updates.expired_at = updates.expired_at || new Date();
    }

    await pr.update(updates);
    const updatedPR = await pr.reload();

    // ── Emitir a CRM via Socket.io ────────────────────
    if (_io) {
      const eventName = result.status === 'paid' ? 'payment_received' : 'payment_expired';
      _io.to(`conversation:${pr.conversation_id}`).emit(eventName, {
        conversationId:   pr.conversation_id,
        paymentRequestId: pr.id,
        status:           result.status,
        amount:           pr.amount,
        payerName:        result.payerName,
        voucherId:        result.voucherId,
      });

      // Alerta global para el dashboard (todas las pestañas)
      _io.emit('payment_status_change', {
        paymentRequestId: pr.id,
        status:           result.status,
        amount:           pr.amount,
        currency:         pr.currency_code,
      });
    }

    // ── Notificar al cliente por WhatsApp ─────────────
    if (pr.conversation_id) {
      const contact = await Contact.findByPk(pr.contact_id);
      if (contact?.phone) {
        if (result.status === 'paid') {
          await botEngine.notifyPaymentReceived({
            phone:          contact.phone,
            paymentRequest: updatedPR,
          });
        } else if (result.status === 'expired') {
          await _notifyExpired(contact.phone, updatedPR);
        }
      }
    }

  } catch (err) {
    logger.warn(`[MonitorQR] Error procesando PR ${pr.id}: ${err.message}`);
  }
};

/**
 * Notifica al cliente que el QR venció.
 */
const _notifyExpired = async (phone, pr) => {
  try {
    const { sendBuilderMessage } = botEngine;
    const MessageBuilder = require('../whatsapp/message.builder');
    await sendBuilderMessage(MessageBuilder.qrExpired(phone, pr.paycenter_order_id));
  } catch (err) {
    logger.warn(`[MonitorQR] Error notificando vencimiento a ${phone}: ${err.message}`);
  }
};

/**
 * Ciclo principal de polling.
 * Busca todos los QRs activos y los verifica en paralelo.
 */
const runPoll = async () => {
  try {
    const pending = await PaymentRequest.findAll({
      where: {
        status:          'qr_generated',
        paycenter_qr_id: { [Op.not]: null },
        [Op.or]: [
          { expired_at: null },
          { expired_at: { [Op.gt]: new Date(Date.now() - 5 * 60 * 1000) } },
        ],
      },
    });

    _activeCount = pending.length;
    if (_activeCount === 0) return;

    logger.debug(`[MonitorQR] Verificando ${_activeCount} QR(s) activos`);
    await Promise.allSettled(pending.map(processQR));

  } catch (err) {
    logger.error('[MonitorQR] Error en ciclo de polling:', err.message);
  }
};

/**
 * Inicia el agente Monitor QR.
 * @param {import('socket.io').Server} io
 */
const startQRPolling = (io) => {
  _io = io;
  cron.schedule('*/10 * * * * *', runPoll);
  logger.info('[MonitorQR] Agente Monitor QR activo (cada 10s)');
};

/**
 * Retorna métricas actuales del monitor.
 */
const getMetrics = () => ({ activeQRs: _activeCount });

module.exports = { startQRPolling, getMetrics };
