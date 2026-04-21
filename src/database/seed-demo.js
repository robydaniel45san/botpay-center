/**
 * seed-demo.js — Datos de prueba completos para BotPay Center
 *
 * Genera:
 *   - 10 contactos bolivianos
 *   - Conversaciones en todos los estados (bot, open, pending, resolved)
 *   - Mensajes con flujos completos (bienvenida → servicio → banco → QR)
 *   - PaymentRequests: paid, qr_generated, expired, pending
 *   - Agentes adicionales
 *
 * Uso:  node src/database/seed-demo.js
 * Flags: --clean  limpia demo antes de re-seedear
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { connectDB } = require('../config/database');
const {
  Agent, Contact, Conversation, Message,
  PaymentRequest, Tag, Pipeline, PipelineStage,
} = require('../models/index');
const logger = require('../config/logger');

const CLEAN = process.argv.includes('--clean');

// ─── Datos demo ───────────────────────────────────────────────────────────────

const AGENTS = [
  { name: 'Administrador',  email: 'admin@botpay.local',    password: 'Admin1234!', role: 'admin',      status: 'active' },
  { name: 'Roberto Duran',  email: 'roberto@botpay.local',  password: 'Agent1234!', role: 'agent',      status: 'active' },
  { name: 'Sofia Méndez',   email: 'sofia@botpay.local',    password: 'Agent1234!', role: 'agent',      status: 'active' },
  { name: 'Carlos Quispe',  email: 'carlos@botpay.local',   password: 'Agent1234!', role: 'supervisor', status: 'active' },
];

const CONTACTS = [
  { phone: '59171234001', wa_id: '59171234001', name: 'Juan Mamani',       email: 'juan.mamani@gmail.com',    notes: 'Cliente frecuente' },
  { phone: '59172345002', wa_id: '59172345002', name: 'María Flores',      email: 'mflores@hotmail.com',      notes: 'Paga siempre puntual' },
  { phone: '59173456003', wa_id: '59173456003', name: 'Carlos Quispe',     email: null,                       notes: null },
  { phone: '59174567004', wa_id: '59174567004', name: 'Ana Condori',       email: 'ana.condori@yahoo.com',    notes: 'Prefiere BISA' },
  { phone: '59175678005', wa_id: '59175678005', name: 'Pedro Torrez',      email: null,                       notes: null },
  { phone: '59176789006', wa_id: '59176789006', name: 'Lucía Mendoza',     email: 'lucia.m@gmail.com',        notes: 'Paga electricidad y agua' },
  { phone: '59177890007', wa_id: '59177890007', name: 'Roberto Chávez',    email: null,                       notes: null },
  { phone: '59178901008', wa_id: '59178901008', name: 'Elena Vásquez',     email: 'evasquez@empresa.com.bo',  notes: 'Empresarial — NIT 1234567' },
  { phone: '59179012009', wa_id: '59179012009', name: 'Diego Apaza',       email: null,                       notes: null },
  { phone: '59170123010', wa_id: '59170123010', name: 'Patricia Soliz',    email: 'psoliz@correo.bo',         notes: 'Nueva cliente' },
];

// Helpers de fecha
const daysAgo  = (n)       => new Date(Date.now() - n * 86_400_000);
const minsAgo  = (n)       => new Date(Date.now() - n * 60_000);
const hoursAgo = (n)       => new Date(Date.now() - n * 3_600_000);

// Mensajes de bienvenida del bot
const botWelcome = (name) => `${name ? `Hola *${name}*! ` : ''}Bienvenido a *PayCenter* 💳\n\nTe ayudo a generar QR de cobro al instante o consultar el estado de tus pagos.\n\n_Escribí *menú* en cualquier momento para volver al inicio._`;
const botMenu = '💳 ¿Qué deseas hacer?';

// Mensaje interactivo (como WhatsApp lo envía de vuelta)
const iReply = (id, title) => JSON.stringify({ id, title });

// ─── Constructor de conversaciones demo ──────────────────────────────────────

const buildConversations = (contacts, agents) => {
  const [admin, roberto, sofia] = agents;
  const [juan, maria, carlos, ana, pedro, lucia, roberto_c, elena, diego, patricia] = contacts;

  return [
    // 1. Juan Mamani — bot activo, en medio del flujo de servicios
    {
      contact: juan,
      status: 'bot',
      last_message_at: minsAgo(3),
      last_message_preview: iReply('bank_bisa', '🏦 BISA'),
      unread_count: 2,
      messages: [
        { dir: 'inbound',  type: 'text',        content: 'hola',                          at: minsAgo(12) },
        { dir: 'outbound', type: 'text',        content: botWelcome(juan.name),            at: minsAgo(11), sender: 'bot' },
        { dir: 'outbound', type: 'interactive', content: botMenu,                          at: minsAgo(11), sender: 'bot' },
        { dir: 'inbound',  type: 'interactive', content: iReply('flow_service', '🏠 Pagar un servicio'), at: minsAgo(8) },
        { dir: 'outbound', type: 'text',        content: '🏠 *Pago de Servicios*\n\nSeleccioná el servicio que deseas pagar:', at: minsAgo(8), sender: 'bot' },
        { dir: 'inbound',  type: 'interactive', content: iReply('svc_electricidad', '⚡ Electricidad'), at: minsAgo(5) },
        { dir: 'outbound', type: 'text',        content: '✅ *Electricidad*\n\n¿Con qué banco deseas realizar el pago?', at: minsAgo(5), sender: 'bot' },
        { dir: 'inbound',  type: 'interactive', content: iReply('bank_bisa', '🏦 BISA'),  at: minsAgo(3) },
      ],
      payments: [],
    },

    // 2. María Flores — pago QR generado, esperando confirmación
    {
      contact: maria,
      status: 'bot',
      last_message_at: minsAgo(15),
      last_message_preview: '✅ QR generado exitosamente',
      unread_count: 0,
      messages: [
        { dir: 'inbound',  type: 'text',        content: 'quiero pagar agua',              at: hoursAgo(1) },
        { dir: 'outbound', type: 'text',        content: botWelcome(maria.name),            at: hoursAgo(1), sender: 'bot' },
        { dir: 'inbound',  type: 'interactive', content: iReply('svc_agua', '💧 Agua'),    at: minsAgo(55) },
        { dir: 'inbound',  type: 'interactive', content: iReply('bank_bmsc', '🏦 BMSC'),   at: minsAgo(52) },
        { dir: 'inbound',  type: 'interactive', content: iReply('svc_action_qr', '💳 Generar QR de pago'), at: minsAgo(50) },
        { dir: 'outbound', type: 'text',        content: '💳 *Nuevo cobro QR* — *Agua*\n\n¿Cuál es el monto a cobrar?\n\n_Escribe solo el número._', at: minsAgo(50), sender: 'bot' },
        { dir: 'inbound',  type: 'text',        content: '180',                            at: minsAgo(45) },
        { dir: 'outbound', type: 'text',        content: '⏳ Generando tu QR de cobro...',  at: minsAgo(45), sender: 'bot' },
        { dir: 'outbound', type: 'text',        content: '✅ *QR generado exitosamente*\n\n🛍️ Concepto: *Agua*\n💰 Monto: *BOB 180.00*\n🔖 Referencia: `BP-1234-DEMO`\n⏱ Válido por: *30 minutos*', at: minsAgo(44), sender: 'bot' },
      ],
      payments: [
        { amount: 180, description: 'Agua', bank: 'bmsc', status: 'qr_generated', ref: 'BP-AGUA-001', daysBack: 0, minsBack: 44 },
      ],
    },

    // 3. Carlos Quispe — pago PAGADO exitosamente
    {
      contact: carlos,
      status: 'resolved',
      last_message_at: hoursAgo(3),
      last_message_preview: '🎉 ¡Pago recibido!',
      unread_count: 0,
      messages: [
        { dir: 'inbound',  type: 'text',        content: 'hola necesito pagar internet',   at: hoursAgo(4) },
        { dir: 'outbound', type: 'text',        content: botWelcome(carlos.name),           at: hoursAgo(4), sender: 'bot' },
        { dir: 'inbound',  type: 'interactive', content: iReply('svc_internet', '📡 Internet / Telefonía'), at: hoursAgo(3.8) },
        { dir: 'inbound',  type: 'interactive', content: iReply('bank_bnb', '🏦 BNB'),     at: hoursAgo(3.6) },
        { dir: 'inbound',  type: 'text',        content: '350',                            at: hoursAgo(3.5) },
        { dir: 'outbound', type: 'text',        content: '✅ *QR generado exitosamente*\n\n📡 Concepto: *Internet / Telefonía*\n💰 Monto: *BOB 350.00*\n🔖 Referencia: `BP-NET-002`', at: hoursAgo(3.4), sender: 'bot' },
        { dir: 'outbound', type: 'text',        content: '🎉 *¡Pago recibido!*\n\n💰 Monto: *BOB 350.00*\n👤 Pagador: Carlos Q.\n🔖 Referencia: `BP-NET-002`\n\n¡Gracias por usar BotPay! 🙌', at: hoursAgo(3), sender: 'bot' },
      ],
      payments: [
        { amount: 350, description: 'Internet / Telefonía', bank: 'bnb', status: 'paid', ref: 'BP-NET-002', payer: 'Carlos Quispe', daysBack: 0, minsBack: 180, paidAt: hoursAgo(3) },
      ],
    },

    // 4. Ana Condori — asignada a agente, en conversación activa
    {
      contact: ana,
      status: 'open',
      agent: roberto,
      last_message_at: minsAgo(8),
      last_message_preview: 'Claro, ahora mismo le genero el QR',
      unread_count: 0,
      messages: [
        { dir: 'inbound',  type: 'text',        content: 'Hola, tengo un problema con mi pago', at: hoursAgo(1) },
        { dir: 'outbound', type: 'text',        content: botWelcome(ana.name),                  at: hoursAgo(1), sender: 'bot' },
        { dir: 'inbound',  type: 'interactive', content: iReply('flow_handoff', '🧑‍💼 Hablar con un agente'), at: minsAgo(55) },
        { dir: 'outbound', type: 'text',        content: '🧑‍💼 *Conectando con un agente...*\n\nEn breve un agente estará contigo.',   at: minsAgo(54), sender: 'bot' },
        { dir: 'outbound', type: 'text',        content: 'Hola Ana, soy Roberto. ¿En qué puedo ayudarte?', at: minsAgo(20), sender: 'agent' },
        { dir: 'inbound',  type: 'text',        content: 'Quiero pagar mi electricidad pero no sé el monto exacto, es como 230 o 240', at: minsAgo(15) },
        { dir: 'outbound', type: 'text',        content: 'No se preocupe, cuando tenga el monto exacto me avisa y le genero el QR', at: minsAgo(10), sender: 'agent' },
        { dir: 'inbound',  type: 'text',        content: '235 bolivianos',                      at: minsAgo(9) },
        { dir: 'outbound', type: 'text',        content: 'Claro, ahora mismo le genero el QR',  at: minsAgo(8), sender: 'agent' },
      ],
      payments: [],
    },

    // 5. Pedro Torrez — pendiente sin asignar
    {
      contact: pedro,
      status: 'pending',
      last_message_at: hoursAgo(2),
      last_message_preview: 'alguien me puede ayudar??',
      unread_count: 4,
      messages: [
        { dir: 'inbound',  type: 'text',        content: 'hola',                              at: hoursAgo(3) },
        { dir: 'outbound', type: 'text',        content: botWelcome(pedro.name),               at: hoursAgo(3), sender: 'bot' },
        { dir: 'inbound',  type: 'interactive', content: iReply('flow_handoff', '🧑‍💼 Hablar con un agente'), at: hoursAgo(2.9) },
        { dir: 'outbound', type: 'text',        content: '🧑‍💼 *Conectando con un agente...*',  at: hoursAgo(2.8), sender: 'bot' },
        { dir: 'inbound',  type: 'text',        content: 'sigo esperando',                    at: hoursAgo(2.5) },
        { dir: 'inbound',  type: 'text',        content: 'hay alguien??',                     at: hoursAgo(2.2) },
        { dir: 'inbound',  type: 'text',        content: 'alguien me puede ayudar??',          at: hoursAgo(2) },
      ],
      payments: [],
    },

    // 6. Lucía Mendoza — QR expirado, intenta nuevo
    {
      contact: lucia,
      status: 'bot',
      last_message_at: hoursAgo(1),
      last_message_preview: iReply('flow_payment', '💳 Nuevo cobro'),
      unread_count: 1,
      messages: [
        { dir: 'inbound',  type: 'text',        content: 'hola',                              at: daysAgo(1) },
        { dir: 'outbound', type: 'text',        content: botWelcome(lucia.name),               at: daysAgo(1), sender: 'bot' },
        { dir: 'inbound',  type: 'interactive', content: iReply('flow_status', '📊 Estado de cuenta'), at: daysAgo(1) },
        { dir: 'outbound', type: 'text',        content: '💳 *Tus últimos cobros:*\n\n• *BOB 95.00* — ❌ Vencido\n  📅 ayer · Ref: `BP-LUZ-003`\n\n', at: daysAgo(1), sender: 'bot' },
        { dir: 'inbound',  type: 'interactive', content: iReply('flow_payment', '💳 Nuevo cobro'), at: hoursAgo(1) },
      ],
      payments: [
        { amount: 95, description: 'Electricidad', bank: 'bisa', status: 'expired', ref: 'BP-LUZ-003', daysBack: 1 },
      ],
    },

    // 7. Roberto Chávez — pago de ayer PAGADO
    {
      contact: roberto_c,
      status: 'resolved',
      last_message_at: daysAgo(1),
      last_message_preview: '🎉 ¡Pago recibido!',
      unread_count: 0,
      messages: [
        { dir: 'inbound',  type: 'text',        content: 'pagar agua',                        at: daysAgo(1) },
        { dir: 'outbound', type: 'text',        content: botWelcome(roberto_c.name),           at: daysAgo(1), sender: 'bot' },
        { dir: 'inbound',  type: 'interactive', content: iReply('svc_agua', '💧 Agua'),       at: daysAgo(1) },
        { dir: 'inbound',  type: 'text',        content: '210',                               at: daysAgo(1) },
        { dir: 'outbound', type: 'text',        content: '🎉 *¡Pago recibido!*\n\n💰 Monto: *BOB 210.00*\n👤 Pagador: Roberto Ch.\n🔖 Referencia: `BP-AGUA-004`', at: daysAgo(1), sender: 'bot' },
      ],
      payments: [
        { amount: 210, description: 'Agua', bank: 'bmsc', status: 'paid', ref: 'BP-AGUA-004', payer: 'Roberto Chávez', daysBack: 1, paidAt: daysAgo(1) },
      ],
    },

    // 8. Elena Vásquez — cliente empresarial, asignada a Sofia, múltiples pagos
    {
      contact: elena,
      status: 'open',
      agent: sofia,
      last_message_at: minsAgo(30),
      last_message_preview: 'Le envío el detalle de los 3 cobros',
      unread_count: 0,
      messages: [
        { dir: 'inbound',  type: 'text',        content: 'Buenos días, somos empresa y necesitamos pagar varios servicios', at: hoursAgo(2) },
        { dir: 'outbound', type: 'text',        content: 'Buenos días Elena! Soy Sofía. ¿Cuántos cobros necesita gestionar?', at: hoursAgo(1.5), sender: 'agent' },
        { dir: 'inbound',  type: 'text',        content: 'Tres: electricidad 500, agua 180, internet 350',                 at: hoursAgo(1) },
        { dir: 'outbound', type: 'text',        content: 'Perfecto, le genero los 3 QR ahora mismo',                       at: minsAgo(55), sender: 'agent' },
        { dir: 'outbound', type: 'text',        content: '✅ *QR generado* — Electricidad BOB 500.00 · Ref: `BP-EMP-005`', at: minsAgo(50), sender: 'agent' },
        { dir: 'outbound', type: 'text',        content: '✅ *QR generado* — Agua BOB 180.00 · Ref: `BP-EMP-006`',         at: minsAgo(48), sender: 'agent' },
        { dir: 'outbound', type: 'text',        content: '✅ *QR generado* — Internet BOB 350.00 · Ref: `BP-EMP-007`',     at: minsAgo(45), sender: 'agent' },
        { dir: 'inbound',  type: 'text',        content: 'Muchas gracias! ya los estoy pagando',                          at: minsAgo(35) },
        { dir: 'outbound', type: 'text',        content: 'Le envío el detalle de los 3 cobros',                            at: minsAgo(30), sender: 'agent' },
      ],
      payments: [
        { amount: 500, description: 'Electricidad', bank: 'bisa', status: 'paid',          ref: 'BP-EMP-005', payer: 'Elena Vásquez', daysBack: 0, minsBack: 50, paidAt: minsAgo(20) },
        { amount: 180, description: 'Agua',          bank: 'bisa', status: 'qr_generated', ref: 'BP-EMP-006', daysBack: 0, minsBack: 48 },
        { amount: 350, description: 'Internet',      bank: 'bisa', status: 'qr_generated', ref: 'BP-EMP-007', daysBack: 0, minsBack: 45 },
      ],
    },

    // 9. Diego Apaza — 3 días atrás, pagó
    {
      contact: diego,
      status: 'resolved',
      last_message_at: daysAgo(3),
      last_message_preview: '🎉 ¡Pago recibido!',
      unread_count: 0,
      messages: [
        { dir: 'inbound',  type: 'text',        content: 'Hola quiero pagar electricidad',   at: daysAgo(3) },
        { dir: 'outbound', type: 'text',        content: botWelcome(diego.name),              at: daysAgo(3), sender: 'bot' },
        { dir: 'inbound',  type: 'text',        content: '420',                              at: daysAgo(3) },
        { dir: 'outbound', type: 'text',        content: '🎉 *¡Pago recibido!*\n\n💰 Monto: *BOB 420.00*\n👤 Pagador: Diego A.\n🔖 Referencia: `BP-LUZ-008`', at: daysAgo(3), sender: 'bot' },
      ],
      payments: [
        { amount: 420, description: 'Electricidad', bank: 'bmsc', status: 'paid', ref: 'BP-LUZ-008', payer: 'Diego Apaza', daysBack: 3, paidAt: daysAgo(3) },
      ],
    },

    // 10. Patricia Soliz — nueva, solo empezó
    {
      contact: patricia,
      status: 'bot',
      last_message_at: minsAgo(1),
      last_message_preview: 'hola',
      unread_count: 1,
      messages: [
        { dir: 'inbound',  type: 'text', content: 'hola', at: minsAgo(1) },
        { dir: 'outbound', type: 'text', content: botWelcome(patricia.name), at: minsAgo(1), sender: 'bot' },
      ],
      payments: [],
    },
  ];
};

// ─── Script principal ─────────────────────────────────────────────────────────

const run = async () => {
  try {
    await connectDB();
    logger.info('Conectado a la DB. Iniciando seed demo...');

    // ── Limpiar datos demo anteriores ──────────────────
    if (CLEAN) {
      logger.info('--clean: eliminando datos demo...');
      const demoPhones = CONTACTS.map(c => c.phone);
      const demoContacts = await Contact.findAll({ where: { phone: demoPhones } });
      const demoContactIds = demoContacts.map(c => c.id);

      if (demoContactIds.length) {
        const convs = await Conversation.findAll({ where: { contact_id: demoContactIds } });
        const convIds = convs.map(c => c.id);
        if (convIds.length) {
          await Message.destroy({ where: { conversation_id: convIds } });
          await PaymentRequest.destroy({ where: { conversation_id: convIds } });
          await Conversation.destroy({ where: { id: convIds } });
        }
        await Contact.destroy({ where: { id: demoContactIds } });
      }
      logger.info('Datos demo anteriores eliminados.');
    }

    // ── Agentes ────────────────────────────────────────
    const agentRecords = [];
    for (const a of AGENTS) {
      const [record] = await Agent.findOrCreate({
        where: { email: a.email },
        defaults: { ...a, password: await bcrypt.hash(a.password, 10) },
      });
      agentRecords.push(record);
    }
    logger.info(`Agentes: ${agentRecords.length} listos`);

    // ── Pipeline base ──────────────────────────────────
    const [pipeline] = await Pipeline.findOrCreate({
      where: { name: 'Cobros QR' },
      defaults: { name: 'Cobros QR', is_default: true },
    });
    for (const s of [
      { name: 'Nuevo', order: 1, color: '#94a3b8' },
      { name: 'QR Enviado', order: 2, color: '#3b82f6' },
      { name: 'En espera de pago', order: 3, color: '#f59e0b' },
      { name: 'Pagado', order: 4, color: '#22c55e', is_closed_won: true },
      { name: 'Vencido', order: 5, color: '#ef4444', is_closed_lost: true },
    ]) {
      await PipelineStage.findOrCreate({ where: { pipeline_id: pipeline.id, name: s.name }, defaults: { ...s, pipeline_id: pipeline.id } });
    }

    // ── Tags ───────────────────────────────────────────
    for (const t of [
      { name: 'Nuevo cliente', color: '#6366f1' },
      { name: 'Recurrente',    color: '#22c55e' },
      { name: 'Pendiente de pago', color: '#f59e0b' },
      { name: 'Pagó',          color: '#10b981' },
      { name: 'Empresarial',   color: '#8b5cf6' },
      { name: 'Soporte',       color: '#ef4444' },
    ]) {
      await Tag.findOrCreate({ where: { name: t.name }, defaults: t });
    }

    // ── Contactos ──────────────────────────────────────
    const contactRecords = [];
    for (const c of CONTACTS) {
      const [record] = await Contact.findOrCreate({
        where: { phone: c.phone },
        defaults: { ...c, status: 'active', opt_in: true, last_seen_at: new Date() },
      });
      contactRecords.push(record);
    }
    logger.info(`Contactos: ${contactRecords.length} listos`);

    // ── Conversaciones + mensajes + pagos ──────────────
    const demos = buildConversations(contactRecords, agentRecords);
    let totalMsgs = 0, totalPayments = 0;

    for (const demo of demos) {
      // Evitar duplicar conversaciones existentes
      const existingConv = await Conversation.findOne({
        where: { contact_id: demo.contact.id, status: demo.status },
      });
      if (existingConv && !CLEAN) {
        logger.info(`  Skip ${demo.contact.name} — conversación ya existe`);
        continue;
      }

      const conv = await Conversation.create({
        id: uuidv4(),
        contact_id: demo.contact.id,
        agent_id:   demo.agent?.id ?? null,
        status:     demo.status,
        channel:    'whatsapp',
        last_message_at:      demo.last_message_at,
        last_message_preview: demo.last_message_preview,
        unread_count:         demo.unread_count,
        resolved_at:          demo.status === 'resolved' ? demo.last_message_at : null,
      });

      // Mensajes
      for (const m of demo.messages) {
        await Message.create({
          id:              uuidv4(),
          conversation_id: conv.id,
          direction:       m.dir,
          sender_type:     m.dir === 'inbound' ? 'contact' : (m.sender || 'bot'),
          sender_id:       m.dir === 'inbound' ? String(demo.contact.id) : (m.sender === 'agent' ? String(demo.agent?.id ?? 1) : null),
          type:            m.type,
          content:         m.content,
          status:          'delivered',
          sent_at:         m.at,
          wa_message_id:   `wamid.demo_${conv.id.slice(0,8)}_${totalMsgs}`,
        });
        totalMsgs++;
      }

      // PaymentRequests
      for (const p of demo.payments) {
        const createdAt = p.daysBack ? daysAgo(p.daysBack) : minsAgo(p.minsBack || 60);
        await PaymentRequest.create({
          id:                    uuidv4(),
          conversation_id:       conv.id,
          contact_id:            demo.contact.id,
          amount:                p.amount,
          currency_code:         'BOB',
          description:           p.description,
          bank_code:             p.bank,
          paycenter_order_id:    p.ref,
          status:                p.status,
          qr_sent_at:            createdAt,
          paid_at:               p.paidAt ?? null,
          expired_at:            p.status === 'expired' ? daysAgo(0.5) : (p.status === 'qr_generated' ? new Date(Date.now() + 30 * 60_000) : null),
          payer_name:            p.payer ?? null,
          payer_bank:            p.status === 'paid' ? p.bank : null,
          voucher_id:            p.status === 'paid' ? `VCH-${p.ref}` : null,
          created_at:            createdAt,
        });
        totalPayments++;
      }

      logger.info(`  ✔ ${demo.contact.name} — ${demo.status} — ${demo.messages.length} msgs — ${demo.payments.length} pagos`);
    }

    logger.info('');
    logger.info('═══════════════════════════════════════════');
    logger.info(' SEED DEMO COMPLETADO');
    logger.info('═══════════════════════════════════════════');
    logger.info(` Contactos:    ${contactRecords.length}`);
    logger.info(` Mensajes:     ${totalMsgs}`);
    logger.info(` Pagos:        ${totalPayments}`);
    logger.info(' Credenciales:');
    logger.info('   admin@botpay.local    / Admin1234!');
    logger.info('   roberto@botpay.local  / Agent1234!');
    logger.info('   sofia@botpay.local    / Agent1234!');
    logger.info('   carlos@botpay.local   / Agent1234!');
    logger.info('═══════════════════════════════════════════');
    process.exit(0);

  } catch (err) {
    logger.error('Error en seed-demo:', err);
    process.exit(1);
  }
};

run();
