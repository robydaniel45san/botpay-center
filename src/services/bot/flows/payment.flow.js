const { generatePaymentQR } = require('../../paycenter/qr.service');
const { Service } = require('../../../models/index');
const logger = require('../../../config/logger');

/**
 * Flujo de cobro QR con catálogo de productos/servicios.
 * Pasos: start → waiting_product → (waiting_amount) → waiting_bank → confirming → generating → done
 *
 * Si el producto tiene precio fijo → salta directo a waiting_bank.
 * Si el producto es "monto libre" (price null) → pasa por waiting_amount.
 */
const handle = async ({ msg, input, contact, conversation, session, sessionService, sendBuilderMessage, MessageBuilder }) => {
  const phone = contact.phone;
  const step = session.currentStep;

  // ── INICIO: mostrar catálogo ──────────────────────────
  if (step === 'start') {
    const products = await Service.findAll({
      where: { status: 'active' },
      order: [['sort_order', 'ASC']],
    });

    if (!products.length) {
      // No hay productos cargados → flujo manual de monto
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '💳 *Nuevo cobro QR*\n\n¿Cuál es el monto a cobrar?\n\n_Escribe solo el número. Ej: 150 o 250.50_',
      });
      await sessionService.updateSession(conversation.id, { currentStep: 'waiting_amount' });
      return;
    }

    await sendBuilderMessage(MessageBuilder.productCatalog(phone, products));
    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_product' });
    return;
  }

  // ── ESPERANDO SELECCIÓN DE PRODUCTO ──────────────────
  if (step === 'waiting_product') {
    // El id del botón viene como "prod_<id>" o "prod_free"
    if (!input.startsWith('prod_')) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '⚠️ Por favor seleccioná un producto de la lista.',
      });
      return;
    }

    if (input === 'prod_free') {
      // Monto libre
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '💳 Ingresá el monto a cobrar:\n\n_Solo el número. Ej: 150 o 250.50_',
      });
      await sessionService.updateSession(conversation.id, {
        currentStep: 'waiting_amount',
        context: { description: 'Cobro manual' },
        retryCount: 0,
      });
      return;
    }

    const productId = input.replace('prod_', '');
    const product = await Service.findByPk(productId);

    if (!product) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '⚠️ Producto no encontrado. Escribí *menú* para volver.',
      });
      return;
    }

    const description = product.name;
    const amount = product.requires_advance_payment && product.advance_payment_amount
      ? parseFloat(product.advance_payment_amount)
      : product.price
        ? parseFloat(product.price)
        : null;

    if (!amount) {
      // Producto sin precio configurado → pedir monto
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: `💳 *${product.name}*\n\n¿Cuál es el monto a cobrar?\n\n_Escribe solo el número. Ej: 150 o 250.50_`,
      });
      await sessionService.updateSession(conversation.id, {
        currentStep: 'waiting_amount',
        context: { description },
        retryCount: 0,
      });
      return;
    }

    // Producto con precio fijo → ir directo a banco
    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_bank',
      context: { amount, description },
      retryCount: 0,
    });
    await sendBuilderMessage(MessageBuilder.selectBank(phone));
    return;
  }

  // ── ESPERANDO MONTO MANUAL ────────────────────────────
  if (step === 'waiting_amount') {
    const amount = parseFloat(input.replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || amount > 99999) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '⚠️ Monto inválido. Ingresá un número mayor a 0.\n\n_Ej: 150 o 250.50_',
      });
      return;
    }

    const description = session.context?.description || 'Cobro BotPay';
    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_bank',
      context: { amount, description },
      retryCount: 0,
    });
    await sendBuilderMessage(MessageBuilder.selectBank(phone));
    return;
  }

  // ── ESPERANDO BANCO ───────────────────────────────────
  if (step === 'waiting_bank') {
    const bankMap = { bank_bmsc: 'bmsc', bank_bnb: 'bnb', bank_bisa: 'bisa' };
    const bank = bankMap[input];

    if (!bank) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage(MessageBuilder.selectBank(phone));
      return;
    }

    const { amount, description } = session.context;
    await sessionService.updateSession(conversation.id, {
      currentStep: 'confirming',
      context: { bank },
      retryCount: 0,
    });

    await sendBuilderMessage(MessageBuilder.confirmPayment(phone, { amount, description }));
    return;
  }

  // ── CONFIRMACIÓN ──────────────────────────────────────
  if (step === 'confirming') {
    if (input === 'confirm_no' || input === 'cancelar') {
      await sessionService.resetSession(conversation.id);
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '❌ Cobro cancelado.\n\nEscribí *menú* para ver las opciones.',
      });
      return;
    }

    if (input !== 'confirm_yes') {
      const { amount, description } = session.context;
      await sendBuilderMessage(MessageBuilder.confirmPayment(phone, { amount, description }));
      return;
    }

    // Generar QR
    await sessionService.updateSession(conversation.id, { currentStep: 'generating' });
    await sendBuilderMessage({
      to: phone,
      method: 'sendText',
      text: '⏳ Generando tu QR de cobro...',
    });

    const { amount, description, bank } = session.context;

    try {
      const paymentRequest = await generatePaymentQR({
        conversationId: conversation.id,
        contactId: contact.id,
        amount,
        description,
        bank,
      });

      await sendBuilderMessage(MessageBuilder.qrGenerated(phone, {
        amount,
        description,
        orderId: paymentRequest.paycenter_order_id,
        expiresMinutes: 30,
      }));

      if (paymentRequest.qr_base64) {
        await sendBuilderMessage({
          to: phone,
          method: 'sendImage',
          url: `data:image/png;base64,${paymentRequest.qr_base64}`,
          caption: `QR de cobro — BOB ${parseFloat(amount).toFixed(2)}`,
        });
      }

      await sessionService.updateSession(conversation.id, {
        currentStep: 'waiting_payment',
        context: { paymentRequestId: paymentRequest.id },
        retryCount: 0,
      });

    } catch (err) {
      logger.error('Error generando QR en PayCenter:', err.message);
      await sessionService.resetSession(conversation.id);
      await sendBuilderMessage({
        to: phone,
        method: 'sendButtons',
        body: '❌ No se pudo generar el QR. Por favor intentá nuevamente o contactá a soporte.',
        buttons: [
          { id: 'flow_payment', title: '🔄 Intentar de nuevo' },
          { id: 'flow_handoff', title: '🧑‍💼 Hablar con agente' },
        ],
      });
    }
    return;
  }

  // ── ESPERANDO PAGO ────────────────────────────────────
  if (step === 'waiting_payment') {
    await sendBuilderMessage({
      to: phone,
      method: 'sendButtons',
      body: '⏳ Estamos esperando la confirmación de tu pago.\n\n¿Deseás hacer algo mientras tanto?',
      buttons: [
        { id: 'flow_status', title: '🔍 Ver estado del cobro' },
        { id: 'flow_menu', title: '📋 Menú principal' },
      ],
    });
  }
};

module.exports = { handle };
