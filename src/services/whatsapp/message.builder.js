/**
 * Constructores de mensajes reutilizables para los flujos del bot.
 * Cada función retorna un objeto listo para pasar a whatsapp.service.js
 */

const MessageBuilder = {

  // ── Menú principal (lista interactiva) ───────────────
  mainMenu(to) {
    return {
      to,
      type: 'interactive',
      method: 'sendList',
      body: '¿En qué puedo ayudarte hoy? 👋',
      header: 'BotPay Center',
      footer: 'Selecciona una opción',
      buttonText: 'Ver menú',
      sections: [
        {
          title: 'Agenda',
          rows: [
            { id: 'flow_booking', title: '📅 Agendar una cita', description: 'Reserva tu hora' },
            { id: 'flow_status', title: '🔍 Mis citas y cobros', description: 'Consultar estado' },
          ],
        },
        {
          title: 'Pagos',
          rows: [
            { id: 'flow_payment', title: '💳 Generar cobro QR', description: 'Cobro directo sin cita' },
          ],
        },
        {
          title: 'Soporte',
          rows: [
            { id: 'flow_handoff', title: '🧑‍💼 Hablar con un agente', description: 'Conectar con soporte' },
            { id: 'flow_faq', title: '❓ Preguntas frecuentes', description: 'Información general' },
          ],
        },
      ],
    };
  },

  // ── Bienvenida (texto) ───────────────────────────────
  welcome(to, name) {
    const greeting = name ? `Hola *${name}*` : 'Hola';
    return {
      to,
      method: 'sendText',
      text: `${greeting} 👋\nBienvenido a *BotPay Center*.\n\nSoy tu asistente de cobros y pagos. Puedo ayudarte a generar QR para cobrar, revisar el estado de tus pagos o conectarte con un agente.\n\n_Escribe *menú* en cualquier momento para ver las opciones._`,
    };
  },

  // ── Confirmación de monto (botones) ─────────────────
  confirmAmount(to, amount, currency = 'BOB') {
    return {
      to,
      method: 'sendButtons',
      header: 'Confirmar cobro',
      body: `¿Confirmas generar un QR de cobro por:\n\n💰 *${currency} ${parseFloat(amount).toFixed(2)}*?`,
      footer: 'El QR tiene validez de 30 minutos',
      buttons: [
        { id: 'confirm_yes', title: '✅ Confirmar' },
        { id: 'confirm_no', title: '❌ Cancelar' },
      ],
    };
  },

  // ── Selección de banco (botones) ─────────────────────
  selectBank(to) {
    return {
      to,
      method: 'sendButtons',
      body: '¿Con qué banco deseas cobrar?',
      footer: 'Elige el banco de tu cuenta',
      buttons: [
        { id: 'bank_bmsc', title: '🏦 BMSC' },
        { id: 'bank_bnb', title: '🏦 BNB' },
        { id: 'bank_bisa', title: '🏦 BISA' },
      ],
    };
  },

  // ── QR generado ──────────────────────────────────────
  qrGenerated(to, { amount, currency = 'BOB', orderId, expiresMinutes = 30 }) {
    return {
      to,
      method: 'sendText',
      text: `✅ *QR generado exitosamente*\n\n💰 Monto: *${currency} ${parseFloat(amount).toFixed(2)}*\n🔖 Referencia: \`${orderId}\`\n⏱ Válido por: *${expiresMinutes} minutos*\n\n📲 Muestra el QR al cliente para que realice el pago.`,
    };
  },

  // ── Pago confirmado ──────────────────────────────────
  paymentReceived(to, { amount, currency = 'BOB', orderId, payerName, voucherId }) {
    return {
      to,
      method: 'sendText',
      text: `🎉 *¡Pago recibido!*\n\n💰 Monto: *${currency} ${parseFloat(amount).toFixed(2)}*\n👤 Pagador: ${payerName || 'N/D'}\n🔖 Referencia: \`${orderId}\`\n🧾 Comprobante: \`${voucherId || 'N/D'}\`\n\n¡Gracias por usar BotPay Center! 🙌`,
    };
  },

  // ── QR vencido ───────────────────────────────────────
  qrExpired(to, orderId) {
    return {
      to,
      method: 'sendButtons',
      body: `⏰ El QR de cobro con referencia \`${orderId}\` ha *vencido* sin recibir el pago.`,
      buttons: [
        { id: 'flow_payment', title: '🔄 Generar nuevo QR' },
        { id: 'flow_handoff', title: '🧑‍💼 Hablar con agente' },
      ],
    };
  },

  // ── Estado de pago ───────────────────────────────────
  paymentStatus(to, { status, amount, currency = 'BOB', orderId, createdAt }) {
    const statusMap = {
      pending: '⏳ Pendiente',
      qr_generated: '📲 QR generado — esperando pago',
      paid: '✅ Pagado',
      expired: '❌ Vencido',
      cancelled: '🚫 Cancelado',
      error: '⚠️ Error',
    };
    const statusLabel = statusMap[status] || status;
    const date = createdAt ? new Date(createdAt).toLocaleString('es-BO') : 'N/D';

    return {
      to,
      method: 'sendText',
      text: `🔍 *Estado del cobro*\n\n🔖 Referencia: \`${orderId}\`\n💰 Monto: *${currency} ${parseFloat(amount).toFixed(2)}*\n📊 Estado: *${statusLabel}*\n📅 Creado: ${date}`,
    };
  },

  // ── Handoff a agente ─────────────────────────────────
  handoffNotice(to) {
    return {
      to,
      method: 'sendText',
      text: `🧑‍💼 *Conectando con un agente...*\n\nEn breve un agente de nuestro equipo estará contigo. Por favor, espera unos momentos.\n\n_Tiempo estimado de espera: menos de 5 minutos._`,
    };
  },

  // ── Agente no disponible ──────────────────────────────
  noAgentAvailable(to) {
    return {
      to,
      method: 'sendButtons',
      body: '😔 En este momento no hay agentes disponibles.\n\n¿Qué deseas hacer?',
      buttons: [
        { id: 'flow_menu', title: '📋 Ver menú' },
        { id: 'flow_payment', title: '💳 Generar cobro' },
      ],
    };
  },

  // ── Mensaje de error genérico ────────────────────────
  errorMessage(to, retry = true) {
    const base = '⚠️ Ocurrió un error inesperado. Por favor intenta nuevamente.';
    if (!retry) return { to, method: 'sendText', text: base };

    return {
      to,
      method: 'sendButtons',
      body: base,
      buttons: [
        { id: 'flow_menu', title: '📋 Ir al menú' },
        { id: 'flow_handoff', title: '🧑‍💼 Hablar con agente' },
      ],
    };
  },

  // ── No entendido ─────────────────────────────────────
  notUnderstood(to) {
    return {
      to,
      method: 'sendButtons',
      body: '🤔 No entendí tu mensaje.\n\n¿Qué deseas hacer?',
      buttons: [
        { id: 'flow_menu', title: '📋 Ver menú' },
        { id: 'flow_handoff', title: '🧑‍💼 Hablar con agente' },
      ],
    };
  },

  // ── FAQ básico (lista) ───────────────────────────────
  faqMenu(to) {
    return {
      to,
      method: 'sendList',
      body: '❓ *Preguntas frecuentes*\nSelecciona una pregunta:',
      buttonText: 'Ver preguntas',
      sections: [
        {
          title: 'Sobre cobros',
          rows: [
            { id: 'faq_qr_time', title: '¿Cuánto dura el QR?', description: 'Validez del código QR' },
            { id: 'faq_qr_banks', title: '¿Qué bancos aceptan?', description: 'Bancos compatibles' },
            { id: 'faq_qr_cancel', title: '¿Puedo cancelar un QR?', description: 'Cancelación de cobros' },
          ],
        },
        {
          title: 'Sobre pagos',
          rows: [
            { id: 'faq_pay_confirm', title: '¿Cómo confirmo el pago?', description: 'Notificación de pago' },
            { id: 'faq_pay_refund', title: '¿Cómo hacer un reembolso?', description: 'Proceso de devolución' },
          ],
        },
      ],
    };
  },
};

module.exports = MessageBuilder;
