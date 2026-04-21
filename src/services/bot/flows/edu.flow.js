/**
 * edu.flow.js — Pago de educación (colegios, universidades)
 *
 * Pasos:
 *   start             → elige institución
 *   waiting_inst      → ingresa código de estudiante
 *   waiting_code      → muestra cuotas pendientes, selecciona
 *   waiting_sel       → confirma y genera QR
 */

const { generatePaymentQR } = require('../../paycenter/qr.service');
const logger                = require('../../../config/logger');

const INSTITUTIONS = {
  inst_ucb:   { name: 'UCB Cochabamba',       logo: '🎓', idLabel: 'código de estudiante', idExample: 'ej: UCB-12345' },
  inst_umss:  { name: 'UMSS',                 logo: '🏫', idLabel: 'código de estudiante', idExample: 'ej: 20240001'  },
  inst_col:   { name: 'Colegio (Privado)',     logo: '🏫', idLabel: 'código del alumno',    idExample: 'ej: ALU-9900'  },
};

// Cuotas mock por institución:código
const FEES_MOCK = {
  'UCB:UCB-12345': {
    alumno: 'Carlos Mamani',
    cuotas: [
      { id: 'UCB-C1', periodo: 'Febrero 2026',  monto: 850.00 },
      { id: 'UCB-C2', periodo: 'Marzo 2026',    monto: 850.00 },
      { id: 'UCB-C3', periodo: 'Abril 2026',    monto: 850.00 },
    ],
  },
  'UMSS:20240001': {
    alumno: 'Ana Quispe',
    cuotas: [
      { id: 'UMS-C1', periodo: 'Matrícula 2026', monto: 200.00 },
      { id: 'UMS-C2', periodo: 'Marzo 2026',     monto: 150.00 },
    ],
  },
  'COL:ALU-9900': {
    alumno: 'Pedro Torrez',
    cuotas: [
      { id: 'COL-C1', periodo: 'Febrero 2026', monto: 450.00 },
      { id: 'COL-C2', periodo: 'Marzo 2026',   monto: 450.00 },
      { id: 'COL-C3', periodo: 'Abril 2026',   monto: 450.00 },
    ],
  },
};

const CONFIRM_WORDS = ['si', 'sí', 'yes', 'ok', 'dale', '1', 'confirmar'];
const CANCEL_WORDS  = ['no', 'cancelar', '2'];

/**
 * Selección acumulativa obligatoria — igual que bill-payment.
 * Tocar una cuota selecciona todas desde la primera hasta esa inclusive.
 */
const selectCuotasUpTo = (cuotas, targetId) => {
  const idx = cuotas.findIndex((c) => c.id === targetId);
  if (idx === -1) return [];
  return cuotas.slice(0, idx + 1).map((c) => c.id);
};

const buildCuotaRows = (cuotas, selectedIds) => {
  const rows = cuotas.map((c, i) => {
    const isSelected = selectedIds.includes(c.id);
    const isNext     = !isSelected && i === selectedIds.length;
    return {
      id:    `cuota_${c.id}`,
      title: `${isSelected ? '✅' : '📋'} ${c.periodo}`,
      description: isSelected
        ? `BOB ${c.monto.toFixed(2)} · incluida`
        : isNext
          ? `BOB ${c.monto.toFixed(2)} · tocá para agregar hasta acá`
          : `BOB ${c.monto.toFixed(2)} · requiere pagar las anteriores`,
    };
  });

  const total = cuotas.reduce((s, c) => s + c.monto, 0);
  rows.push({ id: 'cuota_all', title: '☑️ Pagar todas', description: `Total: BOB ${total.toFixed(2)}` });

  if (selectedIds.length > 0) {
    const sel = cuotas.filter((c) => selectedIds.includes(c.id)).reduce((s, c) => s + c.monto, 0);
    rows.push({ id: 'cuota_confirm', title: '💳 Confirmar pago', description: `${selectedIds.length} cuota(s) · BOB ${sel.toFixed(2)}` });
  }
  return rows;
};

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
      to: phone, method: 'sendList',
      body: '¿En qué institución educativa querés pagar?',
      header: '🎓 Educación', footer: '', buttonText: 'Ver instituciones',
      sections: [{
        title: 'Instituciones',
        rows: [
          { id: 'inst_ucb',  title: '🎓 UCB Cochabamba',   description: 'Universidad Católica Boliviana' },
          { id: 'inst_umss', title: '🏫 UMSS',             description: 'Universidad Mayor de San Simón' },
          { id: 'inst_col',  title: '🏫 Colegio Privado',  description: 'Colegios privados registrados'  },
        ],
      }],
    });
    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_inst' });
    return;
  }

  // ── WAITING_INST ──────────────────────────────────────
  if (step === 'waiting_inst') {
    const inst = INSTITUTIONS[input];
    if (!inst) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Seleccioná una institución válida.' });
      return;
    }
    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_code',
      context: { instId: input, instName: inst.name, instLogo: inst.logo, idLabel: inst.idLabel },
      retryCount: 0,
    });
    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text: `${inst.logo} *${inst.name}*\n\nIngresá tu *${inst.idLabel}*:\n\n_${inst.idExample}_`,
    });
    return;
  }

  // ── WAITING_CODE — buscar cuotas ──────────────────────
  if (step === 'waiting_code') {
    const code   = (msg.text || '').trim().toUpperCase();
    const prefix = ctx.instId === 'inst_ucb' ? 'UCB' : ctx.instId === 'inst_umss' ? 'UMSS' : 'COL';
    const key    = `${prefix}:${code}`;
    const data   = FEES_MOCK[key];

    if (!data) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone, method: 'sendText',
        text: `❌ No encontré cuotas pendientes para el código *${code}* en *${ctx.instName}*.\n\nVerificá e intentá de nuevo.`,
      });
      return;
    }

    if (!data.cuotas.length) {
      await sendBuilderMessage({
        to: phone, method: 'sendButtons',
        body: `✅ *${data.alumno}* — ¡Estás al día! No tenés cuotas pendientes.`,
        buttons: [{ id: 'flow_menu', title: '📋 Menú principal' }],
      });
      await sessionService.resetSession(conversation.id);
      return;
    }

    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_sel',
      context: { code, alumno: data.alumno, cuotas: data.cuotas, selectedIds: [] },
      retryCount: 0,
    });

    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text:
        `✅ *${data.alumno}*\n🏫 ${ctx.instName}\n\n` +
        `Tenés *${data.cuotas.length} cuota(s) pendiente(s)*.\n\n` +
        `📌 _Las cuotas se pagan en orden. Tocá la última que querés incluir ` +
        `y se agregarán todas las anteriores automáticamente._`,
    });
    await sendBuilderMessage({
      to: phone, method: 'sendList',
      body: 'Tocá la última cuota que querés incluir en este pago:',
      header: `${ctx.instLogo} ${ctx.instName}`,
      footer: 'Se incluyen todas desde la primera hasta la que elijas',
      buttonText: 'Ver cuotas',
      sections: [{ title: 'Cuotas pendientes', rows: buildCuotaRows(data.cuotas, []) }],
    });
    return;
  }

  // ── WAITING_SEL — toggle cuotas ───────────────────────
  if (step === 'waiting_sel') {
    let selectedIds = [...(ctx.selectedIds || [])];
    const cuotas    = ctx.cuotas || [];

    if (input === 'cuota_confirm') {
      if (!selectedIds.length) {
        await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Seleccioná al menos una cuota.' });
        return;
      }
      const total = cuotas.filter((c) => selectedIds.includes(c.id)).reduce((s, c) => s + c.monto, 0);
      const detalle = cuotas.filter((c) => selectedIds.includes(c.id)).map((c) => `• ${c.periodo} — BOB ${c.monto.toFixed(2)}`).join('\n');
      await sessionService.updateSession(conversation.id, {
        currentStep: 'waiting_confirm_pay',
        context: { selectedIds, totalAmount: total },
      });
      await sendBuilderMessage({
        to: phone, method: 'sendButtons',
        body: `📋 *Resumen:*\n\n${detalle}\n\n💰 *Total: BOB ${total.toFixed(2)}*\n\n¿Confirmás el pago?`,
        buttons: [
          { id: 'edu_confirm', title: '✅ Sí, pagar' },
          { id: 'edu_cancel',  title: '❌ Cancelar'  },
        ],
      });
      return;
    }

    if (input === 'cuota_all') {
      selectedIds = cuotas.map((c) => c.id);
      const total = cuotas.reduce((s, c) => s + c.monto, 0);
      const detalle = cuotas.map((c) => `• ${c.periodo} — BOB ${c.monto.toFixed(2)}`).join('\n');
      await sessionService.updateSession(conversation.id, {
        currentStep: 'waiting_confirm_pay',
        context: { selectedIds, totalAmount: total },
      });
      await sendBuilderMessage({
        to: phone, method: 'sendButtons',
        body: `📋 *Resumen:*\n\n${detalle}\n\n💰 *Total: BOB ${total.toFixed(2)}*\n\n¿Confirmás el pago?`,
        buttons: [
          { id: 'edu_confirm', title: '✅ Sí, pagar' },
          { id: 'edu_cancel',  title: '❌ Cancelar'  },
        ],
      });
      return;
    }

    if (input.startsWith('cuota_')) {
      const cuotaId = input.replace('cuota_', '');
      const c       = cuotas.find((x) => x.id === cuotaId);

      if (!c) {
        await sessionService.incrementRetry(conversation.id);
        await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Cuota no válida.' });
        return;
      }

      // Si es la única seleccionada y el usuario la vuelve a tocar → deselecciona todo
      const isSoleSelected = selectedIds.length === 1 && selectedIds[0] === cuotaId;
      selectedIds = isSoleSelected ? [] : selectCuotasUpTo(cuotas, cuotaId);

      await sessionService.updateSession(conversation.id, { context: { selectedIds }, retryCount: 0 });

      let feedbackText;
      if (!selectedIds.length) {
        feedbackText = `_Selección borrada. Tocá una cuota para empezar._`;
      } else {
        const total   = cuotas.filter((x) => selectedIds.includes(x.id)).reduce((s, x) => s + x.monto, 0);
        const periods = cuotas.filter((x) => selectedIds.includes(x.id)).map((x) => x.periodo).join(' · ');
        feedbackText =
          `✅ *${selectedIds.length} cuota(s) seleccionada(s):*\n${periods}\n\n` +
          `💰 Total: *BOB ${total.toFixed(2)}*\n\n` +
          `_Confirmá o tocá otra cuota para ajustar._`;
      }

      await sendBuilderMessage({ to: phone, method: 'sendText', text: feedbackText });
      await sendBuilderMessage({
        to: phone, method: 'sendList',
        body: selectedIds.length > 0
          ? `${selectedIds.length} incluida(s). Confirmá o cambiá la selección.`
          : 'Tocá la última cuota que querés incluir en este pago:',
        header: `${ctx.instLogo} ${ctx.instName}`,
        footer: 'Se incluyen todas desde la primera hasta la que elijas',
        buttonText: 'Ver cuotas',
        sections: [{ title: 'Cuotas pendientes', rows: buildCuotaRows(cuotas, selectedIds) }],
      });
      return;
    }

    await sessionService.incrementRetry(conversation.id);
    await sendBuilderMessage({
      to: phone, method: 'sendList',
      body: 'Tocá la última cuota que querés incluir:',
      header: `${ctx.instLogo} ${ctx.instName}`,
      footer: 'Se incluyen todas desde la primera hasta la que elijas',
      buttonText: 'Ver cuotas',
      sections: [{ title: 'Cuotas pendientes', rows: buildCuotaRows(cuotas, ctx.selectedIds || []) }],
    });
    return;
  }

  // ── WAITING_CONFIRM_PAY ───────────────────────────────
  if (step === 'waiting_confirm_pay') {
    const isConfirm = input === 'edu_confirm' || CONFIRM_WORDS.includes(input);
    const isCancel  = input === 'edu_cancel'  || CANCEL_WORDS.includes(input);

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
          amount:         ctx.totalAmount,
          description:    `Cuotas ${ctx.instName} — ${ctx.alumno}`,
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
              `💳 *QR de Pago — ${ctx.instName}*\n\n` +
              `🎓 ${ctx.alumno}\n💰 *BOB ${parseFloat(ctx.totalAmount).toFixed(2)}*\n` +
              `Ref: ${pr.paycenter_order_id}\n\n⏳ 10 minutos para pagar.`,
          });
        } else {
          await sendBuilderMessage({
            to: phone, method: 'sendText',
            text: `✅ QR generado\n🎓 ${ctx.alumno} · ${ctx.instName}\n💰 BOB ${parseFloat(ctx.totalAmount).toFixed(2)}\nRef: \`${pr.paycenter_order_id}\`\n\n⏳ 10 min para pagar.`,
          });
        }
        await sendBuilderMessage({ to: phone, method: 'sendText', text: 'ℹ️ Te notificaremos cuando confirmemos el pago.' });
      } catch (err) {
        logger.error('[Edu] Error generando QR:', err.message);
        await sessionService.resetSession(conversation.id);
        await sendBuilderMessage(MessageBuilder.errorMessage(phone, true));
      }
      return;
    }

    await sessionService.incrementRetry(conversation.id);
    await sendBuilderMessage({
      to: phone, method: 'sendButtons',
      body: `¿Confirmás el pago de *BOB ${parseFloat(ctx.totalAmount || 0).toFixed(2)}*?`,
      buttons: [
        { id: 'edu_confirm', title: '✅ Sí, pagar' },
        { id: 'edu_cancel',  title: '❌ Cancelar'  },
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
          { id: 'flow_edu',  title: '🎓 Nuevo pago'     },
          { id: 'flow_menu', title: '📋 Menú principal'  },
        ],
      });
      await sessionService.resetSession(conversation.id);
      return;
    }
    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text: `⏳ *Tu QR está activo.*\n💰 BOB ${parseFloat(ctx.totalAmount || 0).toFixed(2)}\nTiempo: *${minutesLeft} min*`,
    });
    return;
  }

  await sessionService.resetSession(conversation.id);
  await sendBuilderMessage(MessageBuilder.mainMenu(phone));
};

module.exports = { handle };
