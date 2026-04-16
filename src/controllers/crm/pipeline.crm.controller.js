const { Pipeline, PipelineStage, Deal, Contact, Agent } = require('../../models/index');
const { AppError } = require('../../middleware/errorHandler');

// ── Pipelines ─────────────────────────────────────────
const listPipelines = async (req, res, next) => {
  try {
    const pipelines = await Pipeline.findAll({
      include: [{ model: PipelineStage, as: 'stages', order: [['order', 'ASC']] }],
      where: { status: 'active' },
      order: [['id', 'ASC']],
    });
    res.json({ success: true, data: pipelines });
  } catch (err) { next(err); }
};

const createPipeline = async (req, res, next) => {
  try {
    const { name, description, stages } = req.body;
    if (!name) throw new AppError('Nombre requerido', 400);
    const pipeline = await Pipeline.create({ name, description });
    if (stages?.length) {
      await PipelineStage.bulkCreate(
        stages.map((s, i) => ({ ...s, pipeline_id: pipeline.id, order: s.order ?? i + 1 }))
      );
    }
    const result = await Pipeline.findByPk(pipeline.id, {
      include: [{ model: PipelineStage, as: 'stages' }],
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ── Deals (Kanban) ────────────────────────────────────
const getPipelineDeals = async (req, res, next) => {
  try {
    const { pipelineId } = req.params;
    const stages = await PipelineStage.findAll({
      where: { pipeline_id: pipelineId },
      include: [{
        model: Deal, as: 'deals',
        where: { status: 'open' },
        required: false,
        include: [
          { model: Contact, as: 'contact', attributes: ['id', 'name', 'phone'] },
          { model: Agent, as: 'agent', attributes: ['id', 'name'], required: false },
        ],
      }],
      order: [['order', 'ASC']],
    });
    res.json({ success: true, data: stages });
  } catch (err) { next(err); }
};

const createDeal = async (req, res, next) => {
  try {
    const { pipeline_id, stage_id, contact_id, title, amount, currency_code, notes, expected_close_date } = req.body;
    if (!pipeline_id || !stage_id || !contact_id || !title) throw new AppError('Campos requeridos: pipeline_id, stage_id, contact_id, title', 400);
    const deal = await Deal.create({ pipeline_id, stage_id, contact_id, title, amount, currency_code, notes, expected_close_date, agent_id: req.agent.id });
    res.status(201).json({ success: true, data: deal });
  } catch (err) { next(err); }
};

const moveDeal = async (req, res, next) => {
  try {
    const deal = await Deal.findByPk(req.params.id);
    if (!deal) throw new AppError('Deal no encontrado', 404);
    const { stage_id, status } = req.body;
    const updates = {};
    if (stage_id) updates.stage_id = stage_id;
    if (status) {
      updates.status = status;
      if (status !== 'open') updates.closed_at = new Date();
    }
    await deal.update(updates);

    const io = req.app.get('io');
    io?.emit('deal_moved', { dealId: deal.id, stage_id: updates.stage_id, status: updates.status });

    res.json({ success: true, data: deal });
  } catch (err) { next(err); }
};

// ── Tags ──────────────────────────────────────────────
const { Tag } = require('../../models/index');

const listTags = async (req, res, next) => {
  try {
    const tags = await Tag.findAll({ order: [['name', 'ASC']] });
    res.json({ success: true, data: tags });
  } catch (err) { next(err); }
};

const createTag = async (req, res, next) => {
  try {
    const { name, color, description } = req.body;
    if (!name) throw new AppError('Nombre requerido', 400);
    const tag = await Tag.create({ name, color, description });
    res.status(201).json({ success: true, data: tag });
  } catch (err) { next(err); }
};

const getDeal = async (req, res, next) => {
  try {
    const deal = await Deal.findByPk(req.params.id, {
      include: [
        { model: Contact, as: 'contact', attributes: ['id', 'name', 'phone'] },
        { model: Agent,   as: 'agent',   attributes: ['id', 'name'], required: false },
      ],
    });
    if (!deal) throw new AppError('Deal no encontrado', 404);
    res.json({ success: true, data: deal });
  } catch (err) { next(err); }
};

const removeDeal = async (req, res, next) => {
  try {
    const deal = await Deal.findByPk(req.params.id);
    if (!deal) throw new AppError('Deal no encontrado', 404);
    await deal.update({ status: 'lost', closed_at: new Date() });
    res.json({ success: true, message: 'Deal cerrado' });
  } catch (err) { next(err); }
};

const updateTag = async (req, res, next) => {
  try {
    const tag = await Tag.findByPk(req.params.id);
    if (!tag) throw new AppError('Tag no encontrado', 404);
    const { name, color, description } = req.body;
    await tag.update({ name, color, description });
    res.json({ success: true, data: tag });
  } catch (err) { next(err); }
};

const deleteTag = async (req, res, next) => {
  try {
    const tag = await Tag.findByPk(req.params.id);
    if (!tag) throw new AppError('Tag no encontrado', 404);
    await tag.destroy();
    res.json({ success: true, message: 'Tag eliminado' });
  } catch (err) { next(err); }
};

module.exports = {
  listPipelines, createPipeline,
  getPipelineDeals, createDeal, getDeal, moveDeal, removeDeal,
  listTags, createTag, updateTag, deleteTag,
};
