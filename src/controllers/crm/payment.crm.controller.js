const { Op } = require('sequelize');
const { PaymentRequest, Contact } = require('../../models/index');
const { AppError } = require('../../middleware/errorHandler');
const { syncPaymentStatus } = require('../../services/paycenter/qr.service');

// ── Listar pagos con filtros ──────────────────────────
const list = async (req, res, next) => {
  try {
    const { from, to, status, contactId, bank, page = 1, limit = 25 } = req.query;
    const offset = (page - 1) * limit;
    const where = {};

    if (status)    where.status = status;
    if (contactId) where.contact_id = contactId;
    if (bank)      where.bank_code = bank;
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to)   where.created_at[Op.lte] = new Date(to);
    }

    const { count, rows } = await PaymentRequest.findAndCountAll({
      where,
      include: [{ model: Contact, as: 'contact', attributes: ['id', 'name', 'phone'] }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit), offset: parseInt(offset),
      distinct: true,
    });

    res.json({ success: true, data: rows, meta: { total: count, page: +page, limit: +limit } });
  } catch (err) { next(err); }
};

// ── Detalle de un pago ────────────────────────────────
const getById = async (req, res, next) => {
  try {
    const pr = await PaymentRequest.findByPk(req.params.id, {
      include: [{ model: Contact, as: 'contact', attributes: ['id', 'name', 'phone'] }],
    });
    if (!pr) throw new AppError('Pago no encontrado', 404);
    res.json({ success: true, data: pr });
  } catch (err) { next(err); }
};

// ── Sincronizar estado contra PayCenter ───────────────
// Útil cuando el operador quiere verificar manualmente un pago
const syncStatus = async (req, res, next) => {
  try {
    const pr = await syncPaymentStatus(req.params.id);
    if (!pr) throw new AppError('Pago no encontrado', 404);
    res.json({ success: true, data: pr });
  } catch (err) { next(err); }
};

module.exports = { list, getById, syncStatus };
