/**
 * Flujo de preguntas frecuentes.
 * Respuestas estáticas configurables.
 */
const FAQ_ANSWERS = {
  faq_qr_time: '⏱ *¿Cuánto dura el QR?*\n\nEl código QR tiene una validez de *30 minutos* desde su generación.\nSi vence, puedes generar uno nuevo sin problema.',
  faq_qr_banks: '🏦 *¿Qué bancos aceptan el QR?*\n\nActualmente trabajamos con:\n• BMSC\n• BNB\n• BISA\n\nEl cliente puede pagar desde la app de cualquiera de estos bancos.',
  faq_qr_cancel: '❌ *¿Puedo cancelar un QR?*\n\nSí, puedes cancelar un QR mientras no haya sido pagado.\nContacta a un agente para gestionar la cancelación.',
  faq_pay_confirm: '✅ *¿Cómo confirmo el pago?*\n\nCuando el cliente realice el pago, recibirás una notificación automática aquí en WhatsApp con el comprobante y los datos del pago.',
  faq_pay_refund: '💸 *¿Cómo hacer un reembolso?*\n\nPara gestionar un reembolso, comunícate con un agente de soporte. Los reembolsos se procesan directamente con el banco en un plazo de 1-3 días hábiles.',
};

const handle = async ({ msg, input, contact, conversation, session, sessionService, sendBuilderMessage, MessageBuilder }) => {
  const phone = contact.phone;
  const step = session.currentStep;

  // ── INICIO: mostrar menú de FAQ ───────────────────────
  if (step === 'start') {
    await sendBuilderMessage(MessageBuilder.faqMenu(phone));
    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_question' });
    return;
  }

  // ── RESPONDIENDO PREGUNTA ─────────────────────────────
  if (step === 'waiting_question') {
    const answer = FAQ_ANSWERS[input];

    if (answer) {
      await sendBuilderMessage({ to: phone, method: 'sendText', text: answer });
      await new Promise((r) => setTimeout(r, 600));
      await sendBuilderMessage({
        to: phone,
        method: 'sendButtons',
        body: '¿Puedo ayudarte con algo más?',
        buttons: [
          { id: 'faq_more', title: '❓ Más preguntas' },
          { id: 'flow_handoff', title: '🧑‍💼 Hablar con agente' },
          { id: 'flow_menu', title: '📋 Menú principal' },
        ],
      });
      await sessionService.updateSession(conversation.id, { currentStep: 'post_answer' });
    } else {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage(MessageBuilder.faqMenu(phone));
    }
    return;
  }

  // ── DESPUÉS DE RESPUESTA ──────────────────────────────
  if (step === 'post_answer') {
    if (input === 'faq_more') {
      await sessionService.updateSession(conversation.id, { currentStep: 'waiting_question', retryCount: 0 });
      await sendBuilderMessage(MessageBuilder.faqMenu(phone));
      return;
    }
    // Para flow_menu o flow_handoff el engine lo maneja en el próximo ciclo
    await sessionService.resetSession(conversation.id);
  }
};

module.exports = { handle };
