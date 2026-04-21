/**
 * tax.flow.js — Pago de impuestos y tasas municipales
 *
 * Entidades simuladas: GAMC, SIN, Patente comercial
 * Pasos:
 *   start             → elige entidad
 *   waiting_entity    → ingresa NIT o número de trámite
 *   waiting_ref       → muestra deuda y confirma
 *   waiting_confirm   → genera QR
 */

const { generatePaymentQR } = require('../../paycenter/qr.service');
const logger                = require('../../../config/logger');

const ENTITIES = {
  ent_gamc: { name: 'GAMC Cochabamba', logo: '🏛️', idLabel: 'número de inmueble o patente', idExample: 'ej: 00123456' },
  ent_sin:  { name: 'SIN (Impuestos)',  logo: '📑', idLabel: 'NIT del contribuyente',         idExample: 'ej: 1234567'  },
  ent_pat:  { name: 'Patente Comercial',logo: '🏪', idLabel: 'número de patente',             idExample: 'ej: PAT-4321' },
};

// Deudas mock por entidad:referencia
const DEBTS_MOCK = {
  'GAMC:00123456': { titular: 'Juan Mamani', concepto: 'Impuesto a la propiedad 2026', amount: 320.00 },
  'GAMC:00987654': { titular: 'María Flores', concepto: 'Tasas de aseo 2025-2026',      amount: 85.50  },
  'SIN:1234567':   { titular: 'Empresa SRL',  concepto: 'IVA pendiente T1-2026',        amount: 1500.00},
  'PAT:PAT-4321':  { titular: 'Comercio ABC', concepto: 'Patente comercial 2026',       amount: 450.00 },
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

  // ── START ─────────────────────────────────────────────
  if (step === 'start') {
    await sendBuilderMessage({
      to:         phone,
      method:     'sendList',
      body:       '¿Qué impuesto o tasa querés pagar?',
      header:     '🏛️ Impuestos y Tasas',
      footer:     '',
      buttonText: 'Ver opciones',
      sections: [{
        title: 'Entidades',
        rows: [
          { id: 'ent_gamc', title: '🏛️ GAMC Cochabamba',   description: 'Inmuebles, aseo, patentes municipales' },
          { id: 'ent_sin',  title: '📑 SIN — Impuestos',    description: 'IVA, IT, IUE y otros impuestos'        },
          { id: 'ent_pat',  title: '🏪 Patente Comercial',  description: 'Renovación de patente de negocio'      },
        ],
      }],
    });
    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_entity' });
    return;
  }

  // ── WAITING_ENTITY ────────────────────────────────────
  if (step === 'waiting_entity') {
    const entity = ENTITIES[input];
    if (!entity) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Seleccioná una entidad válida.' });
      return;
    }
    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_ref',
      context: { entityId: input, entityName: entity.name, entityLogo: entity.logo },
      retryCount: 0,
    });
    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text:
        `${entity.logo} *${entity.name}*\n\n` +
        `Ingresá tu *${entity.idLabel}*:\n\n_${entity.idExample}_`,
    });
    return;
  }

  // ── WAITING_REF — buscar deuda ────────────────────────
  if (step === 'waiting_ref') {
    const ref  = (msg.text || '').trim().toUpperCase();
    const prefix = ctx.entityId === 'ent_gamc' ? 'GAMC' : ctx.entityId === 'ent_sin' ? 'SIN' : 'PAT';
    const key  = `${prefix}:${ref}`;
    const debt = DEBTS_MOCK[key];

    if (!debt) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone, method: 'sendText',
        text:
          `❌ No encontré deuda pendiente para la referencia *${ref}* en *${ctx.entityName}*.\n\n` +
          `Verificá el número e intentá de nuevo.`,
      });
      return;
    }

    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_confirm',
      context: { ref, titular: debt.titular, concepto: debt.concepto, amount: debt.amount },
      retryCount: 0,
    });
    await sendBuilderMessage({
      to: phone, method: 'sendButtons',
      body:
        `📋 *Deuda encontrada:*\n\n` +
        `${ctx.entityLogo} ${ctx.entityName}\n` +
        `👤 ${debt.titular}\n` +
        `📄 ${debt.concepto}\n` +
        `💰 *BOB ${debt.amount.toFixed(2)}*\n\n` +
        `¿Confirmás el pago?`,
      buttons: [
        { id: 'tax_confirm', title: '✅ Sí, pagar' },
        { id: 'tax_cancel',  title: '❌ Cancelar'  },
      ],
    });
    return;
  }

  // ── WAITING_CONFIRM ───────────────────────────────────
  if (step === 'waiting_confirm') {
    const isConfirm = input === 'tax_confirm' || CONFIRM_WORDS.includes(input);
    const isCancel  = input === 'tax_cancel'  || CANCEL_WORDS.includes(input);

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
          description:    `${ctx.entityName} — ${ctx.concepto}`,
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
              `💳 *QR de Pago — ${ctx.entityName}*\n\n` +
              `📄 ${ctx.concepto}\n` +
              `💰 *BOB ${parseFloat(ctx.amount).toFixed(2)}*\n` +
              `Ref: ${pr.paycenter_order_id}\n\n` +
              `⏳ Tenés *10 minutos* para pagar.`,
          });
        } else {
          await sendBuilderMessage({
            to: phone, method: 'sendText',
            text:
              `✅ *QR generado*\n${ctx.entityName}\n` +
              `💰 BOB ${parseFloat(ctx.amount).toFixed(2)}\n` +
              `Ref: \`${pr.paycenter_order_id}\`\n\n⏳ 10 minutos para pagar.`,
          });
        }
        await sendBuilderMessage({ to: phone, method: 'sendText', text: 'ℹ️ Te notificaremos cuando confirmemos el pago.' });
      } catch (err) {
        logger.error('[Tax] Error generando QR:', err.message);
        await sessionService.resetSession(conversation.id);
        await sendBuilderMessage(MessageBuilder.errorMessage(phone, true));
      }
      return;
    }

    await sessionService.incrementRetry(conversation.id);
    await sendBuilderMessage({
      to: phone, method: 'sendButtons',
      body: `¿Confirmás el pago de *BOB ${parseFloat(ctx.amount || 0).toFixed(2)}*?`,
      buttons: [
        { id: 'tax_confirm', title: '✅ Sí, pagar' },
        { id: 'tax_cancel',  title: '❌ Cancelar'  },
      ],
    });
    return;
  }

  // ── WAITING_PAYMENT ───────────────────────────────────
  if (step === 'waiting_payment') {
    const expiryMs    = ctx.qrExpiry ? ctx.qrExpiry - Date.now() : 0;
    const minutesLeft = Math.max(0, Math.ceil(expiryMs / 60_000));
    if (expiryMs <= 0) {
      await sendBuilderMessage({
        to: phone, method: 'sendButtons',
        body: '⏰ Tu QR venció. Iniciá el proceso nuevamente.',
        buttons: [
          { id: 'flow_tax',  title: '🏛️ Nuevo pago'      },
          { id: 'flow_menu', title: '📋 Menú principal'   },
        ],
      });
      await sessionService.resetSession(conversation.id);
      return;
    }
    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text:
        `⏳ *Tu QR está activo.*\n\n` +
        `💰 BOB ${parseFloat(ctx.amount || 0).toFixed(2)} · ${ctx.entityName}\n` +
        `Tiempo restante: *${minutesLeft} min*`,
    });
    return;
  }

  await sessionService.resetSession(conversation.id);
  await sendBuilderMessage(MessageBuilder.mainMenu(phone));
};

module.exports = { handle };
