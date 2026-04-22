const bcrypt = require('bcrypt');
const { Agent, Conversation } = require('../../models/index');
const { AppError } = require('../../middleware/errorHandler');
const { Op } = require('sequelize');

const list = async (req, res, next) => {
  try {
    const agents = await Agent.findAll({
      attributes: { exclude: ['password'] },
      order: [['name', 'ASC']],
    });
    res.json({ success: true, data: agents });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { name, email, password, role, max_conversations } = req.body;
    if (!name || !email || !password) throw new AppError('Nombre, email y contraseña requeridos', 400);
    const exists = await Agent.findOne({ where: { email } });
    if (exists) throw new AppError('Ya existe un agente con ese email', 409);
    const hashed = await bcrypt.hash(password, 10);
    const agent = await Agent.create({ name, email, password: hashed, role: role || 'agent', max_conversations: max_conversations || 10 });
    const { password: _, ...data } = agent.toJSON();
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) throw new AppError('Agente no encontrado', 404);
    const { name, role, status, max_conversations, avatar_url } = req.body;
    await agent.update({ name, role, status, max_conversations, avatar_url });
    const { password: _, ...data } = agent.toJSON();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const getStats = async (req, res, next) => {
  try {
    const agentId = req.params.id;
    const today = new Date().toISOString().split('T')[0];
    const [openCount, resolvedToday] = await Promise.all([
      Conversation.count({ where: { agent_id: agentId, status: 'open' } }),
      Conversation.count({ where: { agent_id: agentId, status: 'resolved', resolved_at: { [Op.gte]: new Date(today) } } }),
    ]);
    res.json({ success: true, data: { agentId, openConversations: openCount, resolvedToday } });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
    });
    if (!agent) throw new AppError('Agente no encontrado', 404);
    res.json({ success: true, data: agent });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) throw new AppError('Agente no encontrado', 404);
    // Soft delete — inactivar
    await agent.update({ status: 'inactive' });
    res.json({ success: true, message: 'Agente desactivado' });
  } catch (err) { next(err); }
};

const changePassword = async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) throw new AppError('Agente no encontrado', 404);
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) throw new AppError('Contraseña mínimo 6 caracteres', 400);
    await agent.update({ password: await bcrypt.hash(new_password, 10) });
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (err) { next(err); }
};

module.exports = { list, getById, create, update, remove, getStats, changePassword };
