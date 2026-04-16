const { ScheduleConfig, ScheduleBlock } = require('../../models/index');
const { AppError } = require('../../middleware/errorHandler');

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ── Leer configuración completa de la semana ──────────
const getSchedule = async (req, res, next) => {
  try {
    const configs = await ScheduleConfig.findAll({ order: [['day_of_week', 'ASC']] });

    // Completar los 7 días aunque no estén en BD
    const week = Array.from({ length: 7 }, (_, i) => {
      const found = configs.find((c) => c.day_of_week === i);
      return found || {
        day_of_week: i,
        day_name: DAYS[i],
        is_open: false,
        open_time: null,
        close_time: null,
        slot_duration_minutes: 30,
        break_start: null,
        break_end: null,
      };
    }).map((c) => ({ ...c.toJSON?.() ?? c, day_name: DAYS[c.day_of_week] }));

    res.json({ success: true, data: week });
  } catch (err) { next(err); }
};

// ── Guardar/reemplazar horario de toda la semana ──────
// Body: array de 7 objetos con la configuración de cada día
const saveSchedule = async (req, res, next) => {
  try {
    const days = req.body; // [{ day_of_week, is_open, open_time, close_time, ... }]
    if (!Array.isArray(days)) throw new AppError('Se esperaba un array de días', 400);

    for (const day of days) {
      if (day.day_of_week === undefined) throw new AppError('day_of_week requerido en cada día', 400);
      await ScheduleConfig.upsert({
        day_of_week:           day.day_of_week,
        is_open:               day.is_open ?? false,
        open_time:             day.open_time || null,
        close_time:            day.close_time || null,
        slot_duration_minutes: day.slot_duration_minutes || 30,
        break_start:           day.break_start || null,
        break_end:             day.break_end || null,
      });
    }

    res.json({ success: true, message: 'Horario guardado correctamente' });
  } catch (err) { next(err); }
};

// ── Listar bloqueos de días ────────────────────────────
const getBlocks = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = {};
    if (from || to) {
      where.date = {};
      if (from) where.date[require('sequelize').Op.gte] = from;
      if (to)   where.date[require('sequelize').Op.lte] = to;
    }
    const blocks = await ScheduleBlock.findAll({ where, order: [['date', 'ASC']] });
    res.json({ success: true, data: blocks });
  } catch (err) { next(err); }
};

// ── Crear bloqueo ──────────────────────────────────────
const createBlock = async (req, res, next) => {
  try {
    const { date, reason, block_type, start_time, end_time } = req.body;
    if (!date) throw new AppError('Fecha requerida', 400);
    const block = await ScheduleBlock.create({ date, reason, block_type: block_type || 'full_day', start_time, end_time });
    res.status(201).json({ success: true, data: block });
  } catch (err) { next(err); }
};

// ── Eliminar bloqueo ───────────────────────────────────
const deleteBlock = async (req, res, next) => {
  try {
    const block = await ScheduleBlock.findByPk(req.params.id);
    if (!block) throw new AppError('Bloqueo no encontrado', 404);
    await block.destroy();
    res.json({ success: true, message: 'Bloqueo eliminado' });
  } catch (err) { next(err); }
};

module.exports = { getSchedule, saveSchedule, getBlocks, createBlock, deleteBlock };
