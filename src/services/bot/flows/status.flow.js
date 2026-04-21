const { PaymentRequest } = require('../../../models/index');
const { syncPaymentStatus } = require('../../paycenter/qr.service');

const STATUS_MAP = {
  pending:      '⏳ Pendiente',
  qr_generated: '📲 QR enviado',
  paid:         '✅ Pagado',
  expired:      '❌ Vencido',
  cancelled:    '🚫 Cancelado',
  error:        '⚠️ Error',
};

const handle = async ({ msg, input, contact, conversation, session, sessionService, sendBuilderMessage, MessageBuilder }) => {
  const phone = contact.phone;
  const step  = session.currentStep;

  // ── INICIO: mostrar últimos cobros directamente ───────
  if (step === 'start') {
    const payments = await PaymentRequest.findAll({
      where:  { contact_id: contact.id },
      order:  [['created_at', 'DESC']],
      limit:  5,
    });

    if (!payments.length) {
      await sendBuilderMessage({
        to: phone, method: 'sendButtons',
        body: '📭 No tenés cobros registrados aún.\n\n¿Qué deseas hacer?',
        buttons: [
          { id: 'flow_payment', title: '💳 Generar cobro QR' },
          { id: 'flow_menu',    title: '📋 Menú principal' },
        ],
      });
      await sessionService.resetSession(conversation.id);
      return;
    }

    let text = '💳 *Tus últimos cobros:*\n\n';
    for (const p of payments) {
      let pr = p;
      if (['qr_generated', 'pending'].includes(p.status) && p.paycenter_qr_id) {
        try { pr = await syncPaymentStatus(p.id); } catch {}
      }
      const fecha = new Date(pr.created_at).toLocaleDateString('es-BO');
      text += `• *BOB ${parseFloat(pr.amount).toFixed(2)}* — ${STATUS_MAP[pr.status] || pr.status}\n`;
      text += `  📅 ${fecha} · Ref: \`${pr.paycenter_order_id || pr.id.slice(0, 8)}\`\n\n`;
    }

    await sendBuilderMessage({ to: phone, method: 'sendText', text });
    await sendBuilderMessage({
      to: phone, method: 'sendButtons',
      body: '¿Qué deseas hacer?',
      buttons: [
        { id: 'flow_payment', title: '💳 Nuevo cobro' },
        { id: 'flow_menu',    title: '📋 Menú principal' },
      ],
    });
    await sessionService.resetSession(conversation.id);
    return;
  }

  // Fallback: resetear al menú
  await sessionService.resetSession(conversation.id);
  await sendBuilderMessage(MessageBuilder.mainMenu(phone));
};

module.exports = { handle };
