/**
 * Agente Orquestador
 * ──────────────────
 * Analiza el texto libre del usuario y detecta su intención
 * sin depender de que seleccione explícitamente del menú.
 *
 * Si el input coincide con una intención clara → enruta directamente al flujo.
 * Si hay ambigüedad o no se detecta nada → devuelve null para mostrar el menú.
 *
 * Intenciones soportadas:
 *   payment  → quiere cobrar / pagar / transferir / QR
 *   booking  → quiere agendar / reservar / cita / turno
 *   status   → quiere ver estado de pago o cita
 *   agenda   → quiere ver / cancelar / reagendar sus citas
 *   handoff  → quiere hablar con persona / agente / soporte
 *   faq      → tiene una pregunta general
 */

/**
 * Mapa de intenciones → palabras clave (en español e inglés).
 * El orden importa: se evalúa de arriba hacia abajo.
 */
const INTENT_MAP = [
  {
    flow: 'service',
    keywords: [
      'electricidad', 'luz', 'ande', 'corriente',
      'agua', 'saguapac', 'semapa',
      'internet', 'telefonía', 'telefonia', 'entel', 'tigo', 'viva',
      'pagar servicio', 'pago de servicio', 'servicio basico', 'servicio básico',
    ],
  },
  {
    flow: 'payment',
    keywords: [
      'cobrar', 'cobro', 'pagar', 'pago', 'qr', 'transferir', 'transferencia',
      'generar', 'factura', 'precio', 'cuanto', 'cuánto', 'costo', 'costar',
      'pay', 'charge', 'invoice',
    ],
  },
  {
    flow: 'agenda',
    keywords: [
      'cancelar cita', 'cancelar mi cita', 'reagendar', 'cambiar cita',
      'mis citas', 'ver cita', 'ver mis citas', 'tengo cita',
      'cancel appointment', 'reschedule',
    ],
  },
  {
    flow: 'booking',
    keywords: [
      'agendar', 'agenda', 'reservar', 'reserva', 'cita', 'turno', 'appointment',
      'quiero una cita', 'quiero turno', 'horario', 'disponibilidad',
      'book', 'schedule',
    ],
  },
  {
    flow: 'status',
    keywords: [
      'estado', 'consultar', 'seguimiento', 'mi pago', 'mis pagos',
      'pagado', 'pendiente', 'comprobante', 'voucher', 'status', 'check',
    ],
  },
  {
    flow: 'handoff',
    keywords: [
      'agente', 'persona', 'humano', 'soporte', 'ayuda', 'hablar',
      'asesor', 'operador', 'help', 'support', 'agent',
    ],
  },
  {
    flow: 'faq',
    keywords: [
      'pregunta', 'duda', 'información', 'informacion', 'cómo', 'como',
      'qué es', 'que es', 'cuánto tiempo', 'cuando', 'cuándo',
      'faq', 'info',
    ],
  },
];

/**
 * Detecta la intención del usuario desde texto libre.
 * @param {string} input - Texto normalizado (lowercase, sin acentos parciales)
 * @returns {{ flow: string, confidence: number } | null}
 */
const detectIntent = (input) => {
  if (!input || input.length < 2) return null;

  const normalized = input.toLowerCase().trim();

  for (const { flow, keywords } of INTENT_MAP) {
    // Buscar coincidencia de frase completa primero (más confianza)
    const phraseMatch = keywords.some((kw) => kw.includes(' ') && normalized.includes(kw));
    if (phraseMatch) return { flow, confidence: 0.95 };

    // Luego buscar palabra suelta
    const wordMatch = keywords.some((kw) => {
      // Coincidencia exacta de palabra (evitar "costar" matchear "estado")
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      return regex.test(normalized);
    });
    if (wordMatch) return { flow, confidence: 0.75 };
  }

  return null;
};

/**
 * Decide si el input debe ser ruteado directamente a un flujo
 * sin pasar por el menú. Solo actúa cuando no hay flujo activo.
 *
 * @param {string} input
 * @param {object} session
 * @returns {string|null} nombre del flujo o null
 */
const routeIntent = (input, session) => {
  // Si ya hay un flujo activo, el orquestador no interviene
  if (session?.currentFlow && session.currentFlow !== 'menu') return null;

  const intent = detectIntent(input);
  if (!intent) return null;

  // Umbral mínimo de confianza
  if (intent.confidence < 0.7) return null;

  return intent.flow;
};

/**
 * Construye el mensaje de "¿Quisiste decir X?" para confirmación.
 * Útil si la confianza es media (0.7-0.85).
 */
const buildIntentConfirm = (to, flow, originalInput) => {
  const labels = {
    service:  '🏠 Pagar un servicio (Electricidad, Agua, Internet...)',
    payment:  '💳 Generar un cobro QR',
    booking:  '📅 Agendar una cita',
    agenda:   '📋 Ver o gestionar tus citas',
    status:   '🔍 Consultar estado de pago o cita',
    handoff:  '🧑‍💼 Hablar con un agente',
    faq:      '❓ Ver preguntas frecuentes',
  };

  return {
    to,
    method: 'sendButtons',
    body: `Entendí que querés: *${labels[flow] || flow}*\n\n¿Es correcto?`,
    footer: `Recibí: "${originalInput}"`,
    buttons: [
      { id: `flow_${flow}`,  title: '✅ Sí, eso quiero' },
      { id: 'flow_menu',     title: '📋 Ver el menú' },
    ],
  };
};

module.exports = { detectIntent, routeIntent, buildIntentConfirm };
