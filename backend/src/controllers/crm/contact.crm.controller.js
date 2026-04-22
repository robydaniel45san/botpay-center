const { Op } = require('sequelize');
const { Contact, Conversation, Message, Tag, ContactTag, PaymentRequest, Appointment, Service } = require('../../models/index');
const { AppError } = require('../../middleware/errorHandler');

// ── Listar contactos con filtros y paginación ─────────
const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, status, tag } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const include = [{ model: Tag, as: 'tags', attributes: ['id', 'name', 'color'], through: { attributes: [] } }];
    if (tag) include[0].where = { id: tag };

    const { count, rows } = await Contact.findAndCountAll({
      where, include, distinct: true,
      order: [['last_seen_at', 'DESC NULLS LAST']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({ success: true, data: rows, meta: { total: count, page: +page, limit: +limit, pages: Math.ceil(count / limit) } });
  } catch (err) { next(err); }
};

// ── Detalle de contacto ───────────────────────────────
const getById = async (req, res, next) => {
  try {
    const contact = await Contact.findByPk(req.params.id, {
      include: [
        { model: Tag, as: 'tags', attributes: ['id', 'name', 'color'], through: { attributes: [] } },
        { model: Conversation, as: 'conversations', attributes: ['id', 'status', 'last_message_at', 'last_message_preview', 'unread_count'], limit: 5, order: [['last_message_at', 'DESC']] },
      ],
    });
    if (!contact) throw new AppError('Contacto no encontrado', 404);
    res.json({ success: true, data: contact });
  } catch (err) { next(err); }
};

// ── Crear contacto manualmente ────────────────────────
const create = async (req, res, next) => {
  try {
    const { phone, name, email, document_id, notes } = req.body;
    if (!phone) throw new AppError('Teléfono requerido', 400);
    const existing = await Contact.findOne({ where: { phone } });
    if (existing) throw new AppError('Ya existe un contacto con ese teléfono', 409);
    const contact = await Contact.create({ phone, name, email, document_id, notes, wa_id: phone });
    res.status(201).json({ success: true, data: contact });
  } catch (err) { next(err); }
};

// ── Actualizar contacto ───────────────────────────────
const update = async (req, res, next) => {
  try {
    const contact = await Contact.findByPk(req.params.id);
    if (!contact) throw new AppError('Contacto no encontrado', 404);
    const { name, email, document_id, notes, status, opt_in } = req.body;
    await contact.update({ name, email, document_id, notes, status, opt_in });
    res.json({ success: true, data: contact });
  } catch (err) { next(err); }
};

// ── Historial de mensajes ─────────────────────────────
const getMessages = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const conversation = await Conversation.findOne({
      where: { contact_id: req.params.id },
      order: [['last_message_at', 'DESC']],
    });
    if (!conversation) return res.json({ success: true, data: [] });

    const { count, rows } = await Message.findAndCountAll({
      where: { conversation_id: conversation.id },
      order: [['sent_at', 'DESC']],
      limit: parseInt(limit), offset: parseInt(offset),
    });

    res.json({ success: true, data: rows, meta: { total: count, page: +page } });
  } catch (err) { next(err); }
};

// ── Historial de pagos ────────────────────────────────
const getPayments = async (req, res, next) => {
  try {
    const payments = await PaymentRequest.findAll({
      where: { contact_id: req.params.id },
      order: [['created_at', 'DESC']],
      limit: 20,
    });
    res.json({ success: true, data: payments });
  } catch (err) { next(err); }
};

// ── Citas del contacto ────────────────────────────────
const getAppointments = async (req, res, next) => {
  try {
    const appointments = await Appointment.findAll({
      where: { contact_id: req.params.id },
      include: [{ model: Service, as: 'service', attributes: ['name', 'emoji', 'duration_minutes'] }],
      order: [['appointment_date', 'DESC'], ['start_time', 'DESC']],
      limit: 20,
    });
    res.json({ success: true, data: appointments });
  } catch (err) { next(err); }
};

// ── Asignar/quitar tags ───────────────────────────────
const assignTag = async (req, res, next) => {
  try {
    const contact = await Contact.findByPk(req.params.id);
    if (!contact) throw new AppError('Contacto no encontrado', 404);
    const { tagIds } = req.body; // array de IDs
    await ContactTag.destroy({ where: { contact_id: contact.id } });
    if (tagIds?.length) {
      await ContactTag.bulkCreate(tagIds.map((tag_id) => ({ contact_id: contact.id, tag_id })));
    }
    const updated = await Contact.findByPk(contact.id, {
      include: [{ model: Tag, as: 'tags', attributes: ['id', 'name', 'color'], through: { attributes: [] } }],
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// ── Bloquear / eliminar contacto ──────────────────────
const remove = async (req, res, next) => {
  try {
    const contact = await Contact.findByPk(req.params.id);
    if (!contact) throw new AppError('Contacto no encontrado', 404);
    await contact.update({ status: 'blocked' });
    res.json({ success: true, message: 'Contacto bloqueado' });
  } catch (err) { next(err); }
};

module.exports = { list, getById, create, update, remove, getMessages, getPayments, getAppointments, assignTag };
