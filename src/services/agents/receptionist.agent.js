/**
 * Agente Recepcionista
 * ────────────────────
 * Personaliza el saludo y el menú principal según el tipo de negocio.
 * El tipo de negocio se configura en .env (BUSINESS_TYPE y BUSINESS_NAME).
 *
 * Tipos soportados: ropa | salud | comida | belleza | tecnologia | general
 *
 * Responsabilidades:
 *  - Saludar con contexto del negocio
 *  - Mostrar menú adaptado al rubro (ej: "Agendar consulta" en salud vs "Ver catálogo" en ropa)
 *  - Detectar si el cliente es nuevo (sin nombre) → capturar nombre antes del menú
 *  - Detectar horario: fuera de horario → mensaje informativo
 */

const BUSINESS_TYPE  = (process.env.BUSINESS_TYPE  || 'general').toLowerCase();
const BUSINESS_NAME  = process.env.BUSINESS_NAME   || 'BotPay Center';
const BUSINESS_HOURS = process.env.BUSINESS_HOURS  || '8:00-18:00'; // formato HH:MM-HH:MM
const BUSINESS_TZ    = process.env.BUSINESS_TZ     || 'America/La_Paz';

/**
 * Verifica si el horario actual está dentro del horario de atención.
 */
const isWithinBusinessHours = () => {
  try {
    const now = new Date();
    const local = new Intl.DateTimeFormat('es-BO', {
      timeZone: BUSINESS_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);

    const [hNow, mNow] = local.split(':').map(Number);
    const [startStr, endStr] = BUSINESS_HOURS.split('-');
    const [hStart, mStart] = startStr.split(':').map(Number);
    const [hEnd, mEnd]     = endStr.split(':').map(Number);

    const nowMin   = hNow   * 60 + mNow;
    const startMin = hStart * 60 + mStart;
    const endMin   = hEnd   * 60 + mEnd;

    return nowMin >= startMin && nowMin <= endMin;
  } catch {
    return true; // Si falla la verificación, asumir dentro del horario
  }
};

/**
 * Retorna la configuración del negocio según el tipo.
 */
const getBusinessConfig = () => {
  const configs = {
    ropa: {
      emoji: '👔',
      greeting: `Bienvenido a *${BUSINESS_NAME}* 👗\n\nSomos tu tienda de ropa favorita. ¿En qué te podemos ayudar hoy?`,
      menuSections: [
        {
          title: 'Compras',
          rows: [
            { id: 'flow_payment', title: '🛍️ Ver catálogo y comprar', description: 'Elegí tu producto' },
            { id: 'flow_status',  title: '📦 Estado de mi pedido',   description: 'Consultar tu compra' },
          ],
        },
        {
          title: 'Atención',
          rows: [
            { id: 'flow_agenda',  title: '📋 Mis pedidos y citas',  description: 'Ver, cancelar o reagendar' },
            { id: 'flow_handoff', title: '🧑‍💼 Hablar con asesor',   description: 'Atención personalizada' },
            { id: 'flow_faq',     title: '❓ Preguntas frecuentes',  description: 'Tallas, envíos, cambios' },
          ],
        },
      ],
    },
    salud: {
      emoji: '🏥',
      greeting: `Bienvenido a *${BUSINESS_NAME}* 🏥\n\nEstamos para cuidar tu salud. ¿Cómo podemos ayudarte?`,
      menuSections: [
        {
          title: 'Citas',
          rows: [
            { id: 'flow_booking', title: '📅 Agendar consulta',    description: 'Reservá tu cita médica' },
            { id: 'flow_status',  title: '🔍 Mis citas',           description: 'Ver o cancelar cita' },
          ],
        },
        {
          title: 'Pagos',
          rows: [
            { id: 'flow_payment', title: '💳 Pagar consulta',      description: 'Generar QR de pago' },
          ],
        },
        {
          title: 'Soporte',
          rows: [
            { id: 'flow_agenda',  title: '📋 Mis citas',              description: 'Ver, cancelar o reagendar' },
            { id: 'flow_handoff', title: '🧑‍⚕️ Hablar con recepción', description: 'Consultas generales' },
            { id: 'flow_faq',     title: '❓ Preguntas frecuentes',    description: 'Horarios, seguros, etc.' },
          ],
        },
      ],
    },
    comida: {
      emoji: '🍽️',
      greeting: `Bienvenido a *${BUSINESS_NAME}* 🍽️\n\n¡Hola! ¿Querés hacer un pedido o reservar una mesa?`,
      menuSections: [
        {
          title: 'Pedidos',
          rows: [
            { id: 'flow_payment', title: '🛒 Hacer un pedido',    description: 'Ver menú y pagar' },
            { id: 'flow_status',  title: '📋 Estado de mi pedido', description: 'Consultar tu pedido' },
          ],
        },
        {
          title: 'Reservas',
          rows: [
            { id: 'flow_booking', title: '🪑 Reservar mesa',      description: 'Reservá tu lugar' },
          ],
        },
        {
          title: 'Soporte',
          rows: [
            { id: 'flow_handoff', title: '🧑‍🍳 Hablar con el local', description: 'Consultas del menú' },
            { id: 'flow_faq',     title: '❓ Preguntas frecuentes',  description: 'Horarios, delivery, etc.' },
          ],
        },
      ],
    },
    belleza: {
      emoji: '💅',
      greeting: `Bienvenido a *${BUSINESS_NAME}* 💅\n\n¡Hola! ¿Querés agendar un turno o consultar nuestros servicios?`,
      menuSections: [
        {
          title: 'Turnos',
          rows: [
            { id: 'flow_booking', title: '📅 Agendar turno',       description: 'Reservá tu hora' },
            { id: 'flow_status',  title: '🔍 Mis turnos',          description: 'Ver o cancelar' },
          ],
        },
        {
          title: 'Pagos',
          rows: [
            { id: 'flow_payment', title: '💳 Pagar servicio',      description: 'Generar QR de pago' },
          ],
        },
        {
          title: 'Soporte',
          rows: [
            { id: 'flow_handoff', title: '🧑‍💼 Hablar con el salón', description: 'Consultas generales' },
            { id: 'flow_faq',     title: '❓ Preguntas frecuentes',  description: 'Servicios, precios' },
          ],
        },
      ],
    },
    tecnologia: {
      emoji: '💻',
      greeting: `Bienvenido a *${BUSINESS_NAME}* 💻\n\n¡Hola! ¿En qué te podemos ayudar con tu equipo o servicio?`,
      menuSections: [
        {
          title: 'Servicios',
          rows: [
            { id: 'flow_booking', title: '🔧 Agendar servicio técnico', description: 'Reservá tu reparación' },
            { id: 'flow_payment', title: '💳 Pagar servicio',           description: 'Generar QR de pago' },
          ],
        },
        {
          title: 'Consultas',
          rows: [
            { id: 'flow_status',  title: '🔍 Estado de mi equipo',  description: 'Ver progreso' },
            { id: 'flow_handoff', title: '🧑‍💻 Hablar con soporte',  description: 'Atención técnica' },
            { id: 'flow_faq',     title: '❓ Preguntas frecuentes', description: 'Garantías, tiempos' },
          ],
        },
      ],
    },
    general: {
      emoji: '🏢',
      greeting: `Bienvenido a *${BUSINESS_NAME}* 👋\n\nSoy tu asistente virtual. ¿En qué te puedo ayudar?`,
      menuSections: [
        {
          title: 'Agenda',
          rows: [
            { id: 'flow_booking', title: '📅 Agendar una cita',    description: 'Reservá tu hora' },
            { id: 'flow_status',  title: '🔍 Mis citas y cobros',  description: 'Consultar estado' },
          ],
        },
        {
          title: 'Pagos',
          rows: [
            { id: 'flow_payment', title: '💳 Generar cobro QR',    description: 'Cobro directo' },
          ],
        },
        {
          title: 'Soporte',
          rows: [
            { id: 'flow_handoff', title: '🧑‍💼 Hablar con un agente', description: 'Atención personalizada' },
            { id: 'flow_faq',     title: '❓ Preguntas frecuentes',   description: 'Información general' },
          ],
        },
      ],
    },
  };

  return configs[BUSINESS_TYPE] || configs.general;
};

/**
 * Construye el mensaje de bienvenida según el negocio.
 * @param {string} to   - Número de teléfono destino
 * @param {string} name - Nombre del contacto (puede ser null)
 */
const buildWelcome = (to, name) => {
  const config = getBusinessConfig();
  const nameGreeting = name ? `Hola *${name}*! ` : '';
  return {
    to,
    method: 'sendText',
    text: `${nameGreeting}${config.greeting}\n\n_Escribí *menú* en cualquier momento para volver al inicio._`,
  };
};

/**
 * Construye el menú principal adaptado al negocio.
 * @param {string} to - Número de teléfono destino
 */
const buildMenu = (to) => {
  const config = getBusinessConfig();
  return {
    to,
    method: 'sendList',
    body: `${config.emoji} ¿Qué deseas hacer?`,
    header: BUSINESS_NAME,
    footer: 'Seleccioná una opción',
    buttonText: 'Ver opciones',
    sections: config.menuSections,
  };
};

/**
 * Mensaje de fuera de horario.
 * @param {string} to
 */
const buildOutOfHours = (to) => ({
  to,
  method: 'sendText',
  text: `⏰ *Fuera de horario de atención*\n\nNuestro horario es *${BUSINESS_HOURS}* (BO).\n\nDejanos tu consulta y te responderemos en cuanto abramos. 🙏`,
});

/**
 * Decide si mostrar mensaje fuera de horario o bienvenida normal.
 * Retorna array de mensajes a enviar en orden.
 * @param {string} to
 * @param {string|null} name
 */
const greet = (to, name) => {
  if (!isWithinBusinessHours()) {
    return [buildOutOfHours(to)];
  }
  return [buildWelcome(to, name), buildMenu(to)];
};

module.exports = {
  greet,
  buildWelcome,
  buildMenu,
  buildOutOfHours,
  isWithinBusinessHours,
  getBusinessConfig,
  BUSINESS_NAME,
  BUSINESS_TYPE,
};
