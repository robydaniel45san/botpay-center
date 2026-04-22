const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');

const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Token de acceso requerido', 401));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.agent = decoded;
    next();
  } catch (err) {
    next(new AppError('Token inválido o expirado', 401));
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.agent || !roles.includes(req.agent.role)) {
    return next(new AppError('Acceso denegado: permisos insuficientes', 403));
  }
  next();
};

module.exports = { authenticate, requireRole };
