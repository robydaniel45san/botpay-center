const { Conversation, Agent } = require('../../../models/index');
const { Op } = require('sequelize');

/**
 * Flujo de transferencia a agente humano.
 * Pausa el bot y notifica al agente disponible vía Socket.io.
 */
const handle = async ({ msg, input, contact, conversation, session, sessionService, sendBuilderMessage, MessageBuilder }) => {
  const phone = contact.phone;

  // Buscar agente disponible (online y con cupo)
  const agent = await Agent.findOne({
    where: {
      status: 'active',
      is_online: true,
    },
    order: [['updated_at', 'ASC']], // el que lleva más tiempo sin atender
  });

  if (!agent) {
    await sendBuilderMessage(MessageBuilder.noAgentAvailable(phone));
    await sessionService.resetSession(conversation.id);
    return;
  }

  // Asignar agente y pausar bot
  await Conversation.update(
    {
      agent_id: agent.id,
      status: 'open',
      bot_paused: true,
    },
    { where: { id: conversation.id } }
  );

  // Notificar al cliente
  await sendBuilderMessage(MessageBuilder.handoffNotice(phone));

  // Emitir evento al CRM para el agente (lo recoge el webhook controller vía io)
  // La señal se envía con req.app.get('io') en el webhook controller
  // Aquí lo almacenamos en sesión para que el controller la emita
  await sessionService.updateSession(conversation.id, {
    currentFlow: 'handoff',
    currentStep: 'with_agent',
    context: { agentId: agent.id, agentName: agent.name },
  });
};

module.exports = { handle };
