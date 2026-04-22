/**
 * Flujo de bienvenida.
 * Se ejecuta cuando el bot no tiene flujo activo o el usuario escribe "hola".
 * El bot.engine ya maneja este caso directamente,
 * pero este archivo existe para extensión futura
 * (ej: onboarding de nuevos clientes, captura de datos iniciales).
 */
const handle = async ({ msg, input, contact, conversation, session, sessionService, sendBuilderMessage, MessageBuilder }) => {
  const phone = contact.phone;

  // Si es un cliente completamente nuevo, capturar su nombre
  if (!contact.name) {
    const step = session.currentStep;

    if (step === 'start') {
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '👋 ¡Bienvenido a *BotPay Center*!\n\nPara brindarte una mejor atención, ¿cuál es tu nombre?',
      });
      await sessionService.updateSession(conversation.id, { currentStep: 'waiting_name' });
      return;
    }

    if (step === 'waiting_name') {
      const name = msg.text?.trim();
      if (name && name.length > 1) {
        // Guardar nombre del contacto
        await contact.update({ name });
        await sessionService.updateSession(conversation.id, {
          currentFlow: null,
          currentStep: null,
          context: {},
        });
        await sendBuilderMessage({
          to: phone,
          method: 'sendText',
          text: `Encantado, *${name}*! 😊`,
        });
        // Mostrar menú después del saludo
        await new Promise((r) => setTimeout(r, 500));
        await sendBuilderMessage(MessageBuilder.mainMenu(phone));
        return;
      }
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '¿Cómo te llamas? Por favor ingresa tu nombre.' });
      return;
    }
  }

  // Cliente conocido: ir directo al menú
  await sendBuilderMessage(MessageBuilder.welcome(phone, contact.name));
  await new Promise((r) => setTimeout(r, 600));
  await sendBuilderMessage(MessageBuilder.mainMenu(phone));
  await sessionService.resetSession(conversation.id);
};

module.exports = { handle };
