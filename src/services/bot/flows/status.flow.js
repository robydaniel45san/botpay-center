const { PaymentRequest, Appointment, Service } = require('../../../models/index');
const { checkPaymentStatus } = require('../../paycenter/qr.service');
const { Op } = require('sequelize');

/**
 * Flujo de consulta de estado.
 * Muestra los últimos cobros y citas del contacto.
 */
const handle = async ({ msg, input, contact, conversation, session, sessionService, sendBuilderMessage, MessageBuilder }) => {
  const phone = contact.phone;
  const step = session.currentStep;

  // ── INICIO: ofrecer opciones ──────────────────────────
  if (step === 'start') {
    await sendBuilderMessage({
      to: phone,
      method: 'sendButtons',
      header: '🔍 Consultar estado',
      body: '¿Qué deseas consultar?',
      buttons: [
        { id: 'status_payments', title: '💳 Mis cobros' },
        { id: 'status_appointments', title: '📅 Mis citas' },
        { id: 'flow_menu', title: '📋 Menú principal' },
      ],
    });
    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_type' });
    return;
  }

  // ── SELECCIÓN DE TIPO ─────────────────────────────────
  if (step === 'waiting_type') {
    if (input === 'flow_menu') {
      await sessionService.resetSession(conversation.id);
      return;
    }

    if (input === 'status_payments') {
      // Últimos 5 cobros
      const payments = await PaymentRequest.findAll({
        where: { contact_id: contact.id },
        order: [['created_at', 'DESC']],
        limit: 5,
      });

      if (!payments.length) {
        await sendBuilderMessage({ to: phone, method: 'sendText', text: '📭 No tienes cobros registrados aún.\n\nEscribe *menú* para volver.' });
        await sessionService.resetSession(conversation.id);
        return;
      }

      // Sincronizar estado con PayCenter para cada uno
      const statusMap = {
        pending: '⏳ Pendiente',
        qr_generated: '📲 QR enviado',
        paid: '✅ Pagado',
        expired: '❌ Vencido',
        cancelled: '🚫 Cancelado',
        error: '⚠️ Error',
      };

      let text = '💳 *Tus últimos cobros:*\n\n';
      for (const p of payments) {
        // Sincronizar con PayCenter si está pendiente
        let pr = p;
        if (['qr_generated', 'pending'].includes(p.status) && p.paycenter_qr_id) {
          pr = await checkPaymentStatus(p.id);
        }
        const fecha = new Date(pr.created_at).toLocaleDateString('es-BO');
        text += `• *BOB ${parseFloat(pr.amount).toFixed(2)}* — ${statusMap[pr.status] || pr.status}\n`;
        text += `  📅 ${fecha} · Ref: \`${pr.paycenter_order_id || pr.id.split('-')[0]}\`\n\n`;
      }

      await sendBuilderMessage({ to: phone, method: 'sendText', text });
      await sendBuilderMessage({
        to: phone,
        method: 'sendButtons',
        body: '¿Qué deseas hacer?',
        buttons: [
          { id: 'flow_payment', title: '💳 Nuevo cobro' },
          { id: 'flow_menu', title: '📋 Menú principal' },
        ],
      });
      await sessionService.resetSession(conversation.id);
      return;
    }

    if (input === 'status_appointments') {
      // Próximas citas
      const today = new Date().toISOString().split('T')[0];
      const appointments = await Appointment.findAll({
        where: {
          contact_id: contact.id,
          appointment_date: { [Op.gte]: today },
          status: { [Op.notIn]: ['cancelled', 'no_show'] },
        },
        include: [{ model: Service, as: 'service', attributes: ['name', 'emoji'] }],
        order: [['appointment_date', 'ASC'], ['start_time', 'ASC']],
        limit: 5,
      });

      if (!appointments.length) {
        await sendBuilderMessage({
          to: phone,
          method: 'sendButtons',
          body: '📭 No tienes citas próximas.\n\n¿Deseas agendar una?',
          buttons: [
            { id: 'flow_booking', title: '📅 Agendar cita' },
            { id: 'flow_menu', title: '📋 Menú principal' },
          ],
        });
        await sessionService.resetSession(conversation.id);
        return;
      }

      const apptStatusMap = {
        pending: '⏳ Pendiente',
        confirmed: '✅ Confirmada',
        pending_payment: '💳 Pendiente de pago',
        paid: '💰 Pagada',
        completed: '🏁 Completada',
      };

      let text = '📅 *Tus próximas citas:*\n\n';
      for (const a of appointments) {
        const svc = a.service;
        const emoji = svc?.emoji || '✂️';
        text += `${emoji} *${svc?.name || 'Servicio'}*\n`;
        text += `📅 ${a.appointment_date} · 🕐 ${a.start_time.substring(0, 5)}\n`;
        text += `Estado: ${apptStatusMap[a.status] || a.status}\n\n`;
      }

      await sendBuilderMessage({ to: phone, method: 'sendText', text });
      await sendBuilderMessage({
        to: phone,
        method: 'sendButtons',
        body: '¿Qué deseas hacer?',
        buttons: [
          { id: 'flow_booking', title: '📅 Agendar cita' },
          { id: 'flow_menu', title: '📋 Menú principal' },
        ],
      });
      await sessionService.resetSession(conversation.id);
      return;
    }

    // Input no reconocido
    await sessionService.incrementRetry(conversation.id);
    await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Usa los botones para seleccionar una opción.' });
  }
};

module.exports = { handle };
