const { Service } = require('../../models/index');
const { AppError } = require('../../middleware/errorHandler');

const list = async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;
    const services = await Service.findAll({ where, order: [['sort_order', 'ASC'], ['name', 'ASC']] });
    res.json({ success: true, data: services });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const service = await Service.findByPk(req.params.id);
    if (!service) throw new AppError('Servicio no encontrado', 404);
    res.json({ success: true, data: service });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { name, description, duration_minutes, price, currency_code,
            requires_advance_payment, advance_payment_amount, category,
            emoji, sort_order } = req.body;
    if (!name || !duration_minutes) throw new AppError('Nombre y duración requeridos', 400);
    const service = await Service.create({
      name, description, duration_minutes, price, currency_code,
      requires_advance_payment, advance_payment_amount, category,
      emoji, sort_order,
    });
    res.status(201).json({ success: true, data: service });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const service = await Service.findByPk(req.params.id);
    if (!service) throw new AppError('Servicio no encontrado', 404);
    const { name, description, duration_minutes, price, currency_code,
            requires_advance_payment, advance_payment_amount, category,
            emoji, sort_order, status } = req.body;
    await service.update({ name, description, duration_minutes, price, currency_code,
                           requires_advance_payment, advance_payment_amount, category,
                           emoji, sort_order, status });
    res.json({ success: true, data: service });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const service = await Service.findByPk(req.params.id);
    if (!service) throw new AppError('Servicio no encontrado', 404);
    // Soft delete — marcar como inactivo
    await service.update({ status: 'inactive' });
    res.json({ success: true, message: 'Servicio desactivado' });
  } catch (err) { next(err); }
};

module.exports = { list, getById, create, update, remove };
