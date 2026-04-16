const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Agent } = require('../models/index');
const { AppError } = require('../middleware/errorHandler');

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError('Email y contraseña requeridos', 400);

    const agent = await Agent.findOne({ where: { email } });
    if (!agent) throw new AppError('Credenciales inválidas', 401);
    if (agent.status !== 'active') throw new AppError('Cuenta inactiva', 403);

    const valid = await bcrypt.compare(password, agent.password);
    if (!valid) throw new AppError('Credenciales inválidas', 401);

    const token = jwt.sign(
      { id: agent.id, email: agent.email, role: agent.role, name: agent.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await agent.update({ last_login_at: new Date(), is_online: true });

    res.json({
      success: true,
      data: {
        token,
        agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role, avatar_url: agent.avatar_url },
      },
    });
  } catch (err) { next(err); }
};

const logout = async (req, res, next) => {
  try {
    await Agent.update({ is_online: false }, { where: { id: req.agent.id } });
    res.json({ success: true, message: 'Sesión cerrada' });
  } catch (err) { next(err); }
};

const me = async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.agent.id, {
      attributes: { exclude: ['password'] },
    });
    res.json({ success: true, data: agent });
  } catch (err) { next(err); }
};

const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) throw new AppError('Contraseña actual y nueva requeridas', 400);
    if (new_password.length < 6) throw new AppError('Contraseña mínimo 6 caracteres', 400);

    const agent = await Agent.findByPk(req.agent.id);
    const valid = await bcrypt.compare(current_password, agent.password);
    if (!valid) throw new AppError('Contraseña actual incorrecta', 401);

    await agent.update({ password: await bcrypt.hash(new_password, 10) });
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (err) { next(err); }
};

module.exports = { login, logout, me, changePassword };
