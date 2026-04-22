const { Op } = require('sequelize');
const { Appointment, Service, Contact, Agent, PaymentRequest } = require('../../models/index');
const { AppError } = require('../../middleware/errorHandler');

const list = async (req, res, next) => {
  try {
    const { from, to, status, agentId, page = 1, limit = 25 } = req.query;
    const offset = (page - 1) * limit;
    const where = {};

    if (status) where.status = status;
    if (agentId) where.agent_id = agentId;
    if (from || to) {
      where.appointment_date = {};
      if (from) where.appointment_date[Op.gte] = from;
      if (to)   where.appointment_date[Op.lte] = to;
    }

    const { count, rows } = await Appointment.findAndCountAll({
      where,
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name', 'emoji', 'duration_minutes', 'price'] },
        { model: Contact, as: 'contact', attributes: ['id', 'name', 'phone'] },
        { model: Agent,   as: 'agent',   attributes: ['id', 'name'], required: false },
      ],
      order: [['appointment_date', 'ASC'], ['start_time', 'ASC']],
      limit: parseInt(limit), offset: parseInt(offset),
      distinct: true,
    });

    res.json({ success: true, data: rows, meta: { total: count, page: +page, limit: +limit } });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        { model: Service,        as: 'service' },
        { model: Contact,        as: 'contact' },
        { model: Agent,          as: 'agent',          required: false },
        { model: PaymentRequest, as: 'payment_request', required: false },
      ],
    });
    if (!appointment) throw new AppError('Cita no encontrada', 404);
    res.json({ success: true, data: appointment });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) throw new AppError('Cita no encontrada', 404);

    const { status, appointment_date, start_time, end_time,
            agent_id, internal_notes, cancellation_reason } = req.body;

    const updates = {};
    if (status)              updates.status = status;
    if (appointment_date)    updates.appointment_date = appointment_date;
    if (start_time)          updates.start_time = start_time;
    if (end_time)            updates.end_time = end_time;
    if (agent_id !== undefined) updates.agent_id = agent_id;
    if (internal_notes)      updates.internal_notes = internal_notes;

    if (status === 'confirmed' && !appointment.confirmed_at) {
      updates.confirmed_at = new Date();
    }
    if (status === 'cancelled') {
      updates.cancelled_at = new Date();
      if (cancellation_reason) updates.cancellation_reason = cancellation_reason;
    }

    await appointment.update(updates);

    // Emitir Socket.io
    const io = req.app.get('io');
    io?.emit('appointment_updated', { appointmentId: appointment.id, status: updates.status });

    res.json({ success: true, data: appointment });
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) throw new AppError('Cita no encontrada', 404);
    if (['completed', 'cancelled'].includes(appointment.status)) {
      throw new AppError(`No se puede cancelar una cita con estado: ${appointment.status}`, 400);
    }
    await appointment.update({
      status: 'cancelled',
      cancelled_at: new Date(),
      cancellation_reason: req.body.reason || null,
    });
    res.json({ success: true, message: 'Cita cancelada' });
  } catch (err) { next(err); }
};

module.exports = { list, getById, update, cancel };
