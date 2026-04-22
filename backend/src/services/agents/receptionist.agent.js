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
  const menuSections = [
    {
      title: 'Pagos y servicios',
      rows: [
        { id: 'flow_service', title: '🏠 Pago de servicios',   description: 'Agua, Electricidad, Internet...' },
        { id: 'flow_recharge',title: '📱 Recargas móviles',    description: 'Tigo, Entel, Viva' },
        { id: 'flow_tax',     title: '🏛️ Impuestos y tasas',   description: 'GAMC, SIN, patentes...' },
        { id: 'flow_edu',     title: '🎓 Educación',           description: 'Colegios, universidades' },
      ],
    },
    {
      title: 'Consultas',
      rows: [
        { id: 'flow_status',  title: '📋 Mis pagos',           description: 'Ver historial de pagos' },
        { id: 'flow_handoff', title: '🧑‍💼 Hablar con un agente', description: 'Soporte personalizado' },
      ],
    },
  ];

  const greetingByType = {
    pagos:      `Bienvenido/a a tu plataforma de pago confiable *${BUSINESS_NAME}* 💳\n\nTe puedo ayudar con los pagos a los siguientes servicios o consultas de tus saldos:`,
    ropa:       `Bienvenido a *${BUSINESS_NAME}* 👗\n\nSomos tu tienda de ropa favorita. ¿En qué te podemos ayudar?`,
    salud:      `Bienvenido a *${BUSINESS_NAME}* 🏥\n\nEstamos para cuidar tu salud. ¿Cómo podemos ayudarte?`,
    comida:     `Bienvenido a *${BUSINESS_NAME}* 🍽️\n\n¡Hola! ¿Querés hacer un pedido o consultar tu cuenta?`,
    belleza:    `Bienvenido a *${BUSINESS_NAME}* 💅\n\n¡Hola! ¿Querés generar un pago o consultar tu cuenta?`,
    tecnologia: `Bienvenido a *${BUSINESS_NAME}* 💻\n\n¡Hola! ¿En qué te podemos ayudar?`,
    general:    `Bienvenido a *${BUSINESS_NAME}* 👋\n\nSoy tu asistente virtual. ¿En qué te puedo ayudar?`,
  };

  const emojiByType = {
    pagos: '💳', ropa: '👔', salud: '🏥', comida: '🍽️', belleza: '💅', tecnologia: '💻', general: '🏢',
  };

  const configs = {
    [BUSINESS_TYPE]: {
      emoji: emojiByType[BUSINESS_TYPE] || '🏢',
      greeting: greetingByType[BUSINESS_TYPE] || greetingByType.general,
      menuSections,
    },
  };

  return configs[BUSINESS_TYPE] || { emoji: '🏢', greeting: greetingByType.general, menuSections };
};

/**
 * Construye el mensaje de bienvenida según el negocio.
 * @param {string} to   - Número de teléfono destino
 * @param {string} name - Nombre del contacto (puede ser null)
 */
const buildWelcome = (to, name) => {
  const config = getBusinessConfig();
  const nameGreeting = name ? `Hola *${name}*! 👋 ` : '';
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
