const { Op, fn, col, literal } = require('sequelize');
const { PaymentRequest, Conversation, Contact, Agent, Message } = require('../../models/index');
const { sequelize } = require('../../config/database');

// ── Reporte de pagos ──────────────────────────────────
const paymentsReport = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const dateTo   = to   ? new Date(to)   : new Date();

    const [totalPaid, totalPending, totalExpired, byBank] = await Promise.all([
      // Total pagado
      PaymentRequest.sum('amount', { where: { status: 'paid', paid_at: { [Op.between]: [dateFrom, dateTo] } } }),
      // Pendientes
      PaymentRequest.count({ where: { status: ['qr_generated', 'pending'], created_at: { [Op.between]: [dateFrom, dateTo] } } }),
      // Vencidos
      PaymentRequest.count({ where: { status: 'expired', created_at: { [Op.between]: [dateFrom, dateTo] } } }),
      // Por banco
      PaymentRequest.findAll({
        attributes: ['bank_code', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('amount')), 'total']],
        where: { status: 'paid', paid_at: { [Op.between]: [dateFrom, dateTo] } },
        group: ['bank_code'],
        raw: true,
      }),
    ]);

    // Pagos por día
    const dailyPayments = await PaymentRequest.findAll({
      attributes: [
        [fn('DATE', col('paid_at')), 'date'],
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', col('amount')), 'total'],
      ],
      where: { status: 'paid', paid_at: { [Op.between]: [dateFrom, dateTo] } },
      group: [fn('DATE', col('paid_at'))],
      order: [[fn('DATE', col('paid_at')), 'ASC']],
      raw: true,
    });

    res.json({
      success: true,
      data: {
        summary: { totalPaid: totalPaid || 0, totalPending, totalExpired },
        byBank,
        daily: dailyPayments,
        period: { from: dateFrom, to: dateTo },
      },
    });
  } catch (err) { next(err); }
};

// ── Reporte de conversaciones ─────────────────────────
const conversationsReport = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const dateTo   = to   ? new Date(to)   : new Date();

    const [total, byStatus, newContacts, avgMessages] = await Promise.all([
      Conversation.count({ where: { created_at: { [Op.between]: [dateFrom, dateTo] } } }),
      Conversation.findAll({
        attributes: ['status', [fn('COUNT', col('id')), 'count']],
        where: { created_at: { [Op.between]: [dateFrom, dateTo] } },
        group: ['status'], raw: true,
      }),
      Contact.count({ where: { created_at: { [Op.between]: [dateFrom, dateTo] } } }),
      Message.findAll({
        attributes: [
          'conversation_id',
          [fn('COUNT', col('id')), 'msg_count'],
        ],
        group: ['conversation_id'],
        raw: true,
      }).then((rows) => {
        if (!rows.length) return 0;
        const sum = rows.reduce((a, r) => a + parseInt(r.msg_count), 0);
        return (sum / rows.length).toFixed(1);
      }),
    ]);

    res.json({
      success: true,
      data: { total, byStatus, newContacts, avgMessagesPerConversation: avgMessages, period: { from: dateFrom, to: dateTo } },
    });
  } catch (err) { next(err); }
};

// ── Performance de agentes ────────────────────────────
const agentsReport = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const dateTo   = to   ? new Date(to)   : new Date();

    const agents = await Agent.findAll({ where: { status: 'active' }, attributes: ['id', 'name'] });

    const stats = await Promise.all(agents.map(async (agent) => {
      const [resolved, open] = await Promise.all([
        Conversation.count({ where: { agent_id: agent.id, status: 'resolved', resolved_at: { [Op.between]: [dateFrom, dateTo] } } }),
        Conversation.count({ where: { agent_id: agent.id, status: 'open' } }),
      ]);
      return { agentId: agent.id, name: agent.name, resolvedConversations: resolved, openConversations: open };
    }));

    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
};

module.exports = { paymentsReport, conversationsReport, agentsReport };
