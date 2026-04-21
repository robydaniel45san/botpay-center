/**
 * recharge.flow.js — Recargas móviles (Tigo, Entel, Viva)
 *
 * Pasos:
 *   start              → elige operadora
 *   waiting_operator   → ingresa número de celular
 *   waiting_number     → elige monto
 *   waiting_amount     → confirma recarga
 *   waiting_confirm    → genera QR y espera pago
 */

const { generatePaymentQR } = require('../../paycenter/qr.service');
const logger                = require('../../../config/logger');

const OPERATORS = {
  op_tigo:  { name: 'Tigo',  logo: '🔵', montos: [10, 20, 30, 50, 100] },
  op_entel: { name: 'Entel', logo: '🔴', montos: [10, 20, 30, 50, 100] },
  op_viva:  { name: 'Viva',  logo: '🟠', montos: [10, 20, 30, 50]      },
};

const CONFIRM_WORDS = ['si', 'sí', 'yes', 'ok', 'dale', '1', 'confirmar'];
const CANCEL_WORDS  = ['no', 'cancelar', '2'];

const handle = async ({
  msg, input, contact, conversation,
  session, sessionService, sendBuilderMessage, MessageBuilder,
}) => {
  const phone = contact.phone;
  const step  = session.currentStep;
  const ctx   = session.context || {};

  // ── START — elegir operadora ──────────────────────────
  if (step === 'start') {
    await sendBuilderMessage({
      to:         phone,
      method:     'sendList',
      body:       '¿Con qué operadora querés recargar?',
      header:     '📱 Recargas Móviles',
      footer:     'Seleccioná tu operadora',
      buttonText: 'Ver operadoras',
      sections: [{
        title: 'Operadoras disponibles',
        rows: [
          { id: 'op_tigo',  title: '🔵 Tigo',  description: 'Recarga saldo Tigo'  },
          { id: 'op_entel', title: '🔴 Entel', description: 'Recarga saldo Entel' },
          { id: 'op_viva',  title: '🟠 Viva',  description: 'Recarga saldo Viva'  },
        ],
      }],
    });
    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_operator' });
    return;
  }

  // ── WAITING_OPERATOR ─────────────────────────────────
  if (step === 'waiting_operator') {
    const op = OPERATORS[input];
    if (!op) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone, method: 'sendText',
        text: '⚠️ Seleccioná una operadora válida de la lista.',
      });
      return;
    }
    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_number',
      context: { operatorId: input, operatorName: op.name, operatorLogo: op.logo },
      retryCount: 0,
    });
    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text: `${op.logo} *${op.name}*\n\nIngresá el número de celular a recargar:\n\n_ej: 71234567_`,
    });
    return;
  }

  // ── WAITING_NUMBER ────────────────────────────────────
  if (step === 'waiting_number') {
    const num = (msg.text || '').trim().replace(/\s/g, '');
    if (!/^\d{7,8}$/.test(num)) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone, method: 'sendText',
        text: '⚠️ Ingresá un número válido de 7 u 8 dígitos (ej: 71234567).',
      });
      return;
    }
    const op = OPERATORS[ctx.operatorId];
    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_amount',
      context: { targetNumber: num },
      retryCount: 0,
    });
    await sendBuilderMessage({
      to:         phone,
      method:     'sendList',
      body:       `📱 Recarga para *${num}* (${ctx.operatorName})\n\n¿Cuánto querés recargar?`,
      header:     `${ctx.operatorLogo} ${ctx.operatorName} — Montos`,
      footer:     '',
      buttonText: 'Ver montos',
      sections: [{
        title: 'Montos disponibles',
        rows:  (op?.montos || [10, 20, 50]).map((m) => ({
          id:          `monto_${m}`,
          title:       `BOB ${m}`,
          description: `Recarga de ${m} bolivianos`,
        })),
      }],
    });
    return;
  }

  // ── WAITING_AMOUNT ────────────────────────────────────
  if (step === 'waiting_amount') {
    if (!input.startsWith('monto_')) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Seleccioná un monto de la lista.' });
      return;
    }
    const amount = parseFloat(input.replace('monto_', ''));
    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_confirm',
      context: { amount },
      retryCount: 0,
    });
    await sendBuilderMessage({
      to: phone, method: 'sendButtons',
      body:
        `📋 *Resumen de recarga:*\n\n` +
        `📱 Número: *${ctx.targetNumber}*\n` +
        `${ctx.operatorLogo} Operadora: *${ctx.operatorName}*\n` +
        `💰 Monto: *BOB ${amount.toFixed(2)}*\n\n` +
        `¿Confirmás?`,
      buttons: [
        { id: 'rch_confirm', title: '✅ Sí, recargar' },
        { id: 'rch_cancel',  title: '❌ Cancelar'     },
      ],
    });
    return;
  }

  // ── WAITING_CONFIRM ───────────────────────────────────
  if (step === 'waiting_confirm') {
    const isConfirm = input === 'rch_confirm' || CONFIRM_WORDS.includes(input);
    const isCancel  = input === 'rch_cancel'  || CANCEL_WORDS.includes(input);

    if (isCancel) {
      await sessionService.resetSession(conversation.id);
      await sendBuilderMessage(MessageBuilder.mainMenu(phone));
      return;
    }

    if (isConfirm) {
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⏳ Generando QR de pago...' });
      try {
        const pr = await generatePaymentQR({
          conversationId: conversation.id,
          contactId:      contact.id,
          amount:         ctx.amount,
          description:    `Recarga ${ctx.operatorName} ${ctx.targetNumber}`,
          bank:           process.env.PAYCENTER_DEFAULT_BANK || 'bmsc',
          expiresMinutes: 10,
        });
        await sessionService.updateSession(conversation.id, {
          currentStep: 'waiting_payment',
          context: { paymentRequestId: pr.id, qrExpiry: Date.now() + 10 * 60 * 1000 },
        });
        if (pr.qr_base64) {
          await sendBuilderMessage({
            to: phone, method: 'sendImage',
            url: `data:image/png;base64,${pr.qr_base64}`,
            caption:
              `💳 *QR de Recarga — ${ctx.operatorName}*\n\n` +
              `📱 Número: ${ctx.targetNumber}\n` +
              `💰 Monto: *BOB ${parseFloat(ctx.amount).toFixed(2)}*\n` +
              `Ref: ${pr.paycenter_order_id}\n\n` +
              `⏳ Tenés *10 minutos* para completar el pago.`,
          });
        } else {
          await sendBuilderMessage({
            to: phone, method: 'sendText',
            text:
              `✅ *QR generado*\n📱 ${ctx.targetNumber} · ${ctx.operatorName}\n` +
              `💰 BOB ${parseFloat(ctx.amount).toFixed(2)}\n` +
              `Ref: \`${pr.paycenter_order_id}\`\n\n⏳ 10 minutos para pagar.`,
          });
        }
        await sendBuilderMessage({
          to: phone, method: 'sendText',
          text: 'ℹ️ Te notificaremos automáticamente cuando confirmemos el pago.',
        });
      } catch (err) {
        logger.error('[Recharge] Error generando QR:', err.message);
        await sendBuilderMessage({
          to: phone, method: 'sendButtons',
          body: '⚠️ No pudimos generar el QR. ¿Qué deseas hacer?',
          buttons: [
            { id: 'rch_confirm', title: '🔄 Reintentar'    },
            { id: 'flow_menu',   title: '📋 Menú principal' },
          ],
        });
      }
      return;
    }

    // Input no reconocido
    await sessionService.incrementRetry(conversation.id);
    await sendBuilderMessage({
      to: phone, method: 'sendButtons',
      body: `¿Confirmás la recarga de *BOB ${parseFloat(ctx.amount || 0).toFixed(2)}* a *${ctx.targetNumber}*?`,
      buttons: [
        { id: 'rch_confirm', title: '✅ Sí, recargar' },
        { id: 'rch_cancel',  title: '❌ Cancelar'     },
      ],
    });
    return;
  }

  // ── WAITING_PAYMENT — QR activo ───────────────────────
  if (step === 'waiting_payment') {
    const expiryMs    = ctx.qrExpiry ? ctx.qrExpiry - Date.now() : 0;
    const minutesLeft = Math.max(0, Math.ceil(expiryMs / 60_000));
    if (expiryMs <= 0) {
      await sendBuilderMessage({
        to: phone, method: 'sendButtons',
        body: '⏰ Tu QR venció. Iniciá el proceso nuevamente.',
        buttons: [
          { id: 'flow_recharge', title: '📱 Nueva recarga'  },
          { id: 'flow_menu',     title: '📋 Menú principal' },
        ],
      });
      await sessionService.resetSession(conversation.id);
      return;
    }
    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text:
        `⏳ *Tu QR está activo.*\n\n` +
        `📱 ${ctx.targetNumber} · ${ctx.operatorName}\n` +
        `💰 BOB ${parseFloat(ctx.amount || 0).toFixed(2)}\n` +
        `Tiempo restante: *${minutesLeft} min*\n\n` +
        `Escanéalo con la app de tu banco.`,
    });
    return;
  }

  await sessionService.resetSession(conversation.id);
  await sendBuilderMessage(MessageBuilder.mainMenu(phone));
};

module.exports = { handle };
