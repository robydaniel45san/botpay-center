const Contact = require('./contact.model');
const Agent = require('./agent.model');
const Conversation = require('./conversation.model');
const Message = require('./message.model');
const BotSession = require('./bot_session.model');
const { Tag, ContactTag } = require('./tag.model');
const { Pipeline, PipelineStage, Deal } = require('./pipeline.model');
const PaymentRequest = require('./payment_request.model');

// ── Contact ↔ Conversation ─────────────────────────────
Contact.hasMany(Conversation, { foreignKey: 'contact_id', as: 'conversations' });
Conversation.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

// ── Agent ↔ Conversation ───────────────────────────────
Agent.hasMany(Conversation, { foreignKey: 'agent_id', as: 'conversations' });
Conversation.belongsTo(Agent, { foreignKey: 'agent_id', as: 'agent' });

// ── Conversation ↔ Message ─────────────────────────────
Conversation.hasMany(Message, { foreignKey: 'conversation_id', as: 'messages' });
Message.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });

// ── Conversation ↔ BotSession ──────────────────────────
Conversation.hasOne(BotSession, { foreignKey: 'conversation_id', as: 'bot_session' });
BotSession.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });

// ── Contact ↔ Tag (many-to-many) ───────────────────────
Contact.belongsToMany(Tag, { through: ContactTag, foreignKey: 'contact_id', as: 'tags' });
Tag.belongsToMany(Contact, { through: ContactTag, foreignKey: 'tag_id', as: 'contacts' });

// ── Pipeline ↔ PipelineStage ───────────────────────────
Pipeline.hasMany(PipelineStage, { foreignKey: 'pipeline_id', as: 'stages' });
PipelineStage.belongsTo(Pipeline, { foreignKey: 'pipeline_id', as: 'pipeline' });

// ── Deal associations ──────────────────────────────────
Pipeline.hasMany(Deal, { foreignKey: 'pipeline_id', as: 'deals' });
PipelineStage.hasMany(Deal, { foreignKey: 'stage_id', as: 'deals' });
Contact.hasMany(Deal, { foreignKey: 'contact_id', as: 'deals' });
Agent.hasMany(Deal, { foreignKey: 'agent_id', as: 'deals' });
Conversation.hasMany(Deal, { foreignKey: 'conversation_id', as: 'deals' });
Deal.belongsTo(Pipeline, { foreignKey: 'pipeline_id', as: 'pipeline' });
Deal.belongsTo(PipelineStage, { foreignKey: 'stage_id', as: 'stage' });
Deal.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });
Deal.belongsTo(Agent, { foreignKey: 'agent_id', as: 'agent' });

// ── PaymentRequest associations ────────────────────────
Conversation.hasMany(PaymentRequest, { foreignKey: 'conversation_id', as: 'payment_requests' });
Contact.hasMany(PaymentRequest, { foreignKey: 'contact_id', as: 'payment_requests' });
PaymentRequest.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
PaymentRequest.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

module.exports = {
  Contact,
  Agent,
  Conversation,
  Message,
  BotSession,
  Tag,
  ContactTag,
  Pipeline,
  PipelineStage,
  Deal,
  PaymentRequest,
};
