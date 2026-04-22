require('dotenv').config();
const bcrypt = require('bcrypt');
const { connectDB } = require('../config/database');
const { Agent, Pipeline, PipelineStage, Tag } = require('../models/index');
const logger = require('../config/logger');

const seed = async () => {
  try {
    await connectDB();

    // Agente admin por defecto
    const [admin] = await Agent.findOrCreate({
      where: { email: 'admin@botpay.local' },
      defaults: {
        name: 'Administrador',
        email: 'admin@botpay.local',
        password: await bcrypt.hash('Admin1234!', 10),
        role: 'admin',
        status: 'active',
      },
    });
    logger.info(`Agente admin: ${admin.email}`);

    // Pipeline de cobros por defecto
    const [pipeline] = await Pipeline.findOrCreate({
      where: { name: 'Cobros QR' },
      defaults: { name: 'Cobros QR', is_default: true },
    });

    const stages = [
      { name: 'Nuevo', order: 1, color: '#94a3b8' },
      { name: 'QR Enviado', order: 2, color: '#3b82f6' },
      { name: 'En espera de pago', order: 3, color: '#f59e0b' },
      { name: 'Pagado', order: 4, color: '#22c55e', is_closed_won: true },
      { name: 'Vencido', order: 5, color: '#ef4444', is_closed_lost: true },
    ];

    for (const stage of stages) {
      await PipelineStage.findOrCreate({
        where: { pipeline_id: pipeline.id, name: stage.name },
        defaults: { ...stage, pipeline_id: pipeline.id },
      });
    }
    logger.info('Pipeline "Cobros QR" creado con etapas');

    // Tags iniciales
    const tags = [
      { name: 'Nuevo cliente', color: '#6366f1' },
      { name: 'Recurrente', color: '#22c55e' },
      { name: 'Pendiente de pago', color: '#f59e0b' },
      { name: 'Pagó', color: '#10b981' },
      { name: 'Soporte', color: '#ef4444' },
    ];
    for (const tag of tags) {
      await Tag.findOrCreate({ where: { name: tag.name }, defaults: tag });
    }
    logger.info('Tags iniciales creados');

    logger.info('Seed completado exitosamente');
    process.exit(0);
  } catch (err) {
    logger.error('Error en seed:', err);
    process.exit(1);
  }
};

seed();
