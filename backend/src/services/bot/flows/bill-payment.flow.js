/**
 * bill-payment.flow.js — Pago de facturas de servicios públicos
 *
 * Pasos:
 *   start                   → muestra lista de compañías del servicio elegido
 *   waiting_company_sel     → usuario elige la compañía
 *   waiting_customer_id     → pide número de medidor / contrato
 *   waiting_invoice_sel     → selección múltiple de facturas (toggle)
 *   confirming_selection    → resumen + [✅ Sí, pagar] [❌ Cancelar]
 *   waiting_confirmation    → procesa respuesta del usuario
 *   waiting_cancel_decision → canceló: ¿volver a facturas o menú? (timeout 30 min)
 *   waiting_payment         → QR enviado; el qr-polling.service confirma el pago
 */

const { generatePaymentQR }                      = require('../../paycenter/qr.service');
const { getCompaniesByService, getCompanyMeta,
        findCustomer, markInvoicesPaid }          = require('../../mock/utility.mock');
const logger                                      = require('../../../config/logger');

const QR_TIMEOUT_MS = 10 * 60 * 1000;
const CONFIRM_WORDS = ['si', 'sí', 'yes', 'ok', 'dale', 'confirmar', 'confirmo', '1', 'bueno', 'claro'];
const CANCEL_WORDS  = ['no', 'cancelar', 'cancel', 'nop', 'nope', '2'];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Lista de compañías formateada para sendList */
const buildCompanyRows = (companies) =>
  companies.map((c) => ({
    id:          `cmp_${c.id}`,
    title:       `${c.logo} ${c.name}`,
    description: c.description,
  }));

/**
 * Selección acumulativa obligatoria (lógica Bolivia):
 * Al tocar una factura se seleccionan TODAS desde la primera hasta esa inclusive.
 * No se pueden hacer gaps — la más antigua siempre va primero.
 *
 * Ejemplo: facturas [Ene, Feb, Mar, Abr]
 *   → tocar Mar  → selecciona [Ene, Feb, Mar]
 *   → tocar Ene  → reduce a  [Ene]
 *   → tocar Ene  (ya único seleccionado) → deselecciona todo
 */
const selectUpTo = (invoices, targetId) => {
  const idx = invoices.findIndex((i) => i.id === targetId);
  if (idx === -1) return [];
  return invoices.slice(0, idx + 1).map((i) => i.id);
};

/** Filas de facturas: muestra seleccionadas (✅) y pendientes (📋).
 *  La descripción guía al usuario sobre qué pasa al tocar cada una. */
const buildInvoiceRows = (invoices, selectedIds) => {
  const rows = [];

  for (let i = 0; i < invoices.length; i++) {
    const inv        = invoices[i];
    const isSelected = selectedIds.includes(inv.id);
    // Primera no seleccionada = la que el usuario puede añadir tocando
    const isNext     = !isSelected && i === selectedIds.length;

    rows.push({
      id:    `inv_${inv.id}`,
      title: `${isSelected ? '✅' : '📋'} ${inv.period}`,
      description: isSelected
        ? `BOB ${parseFloat(inv.amount).toFixed(2)} · incluida`
        : isNext
          ? `BOB ${parseFloat(inv.amount).toFixed(2)} · tocá para agregar hasta acá`
          : `BOB ${parseFloat(inv.amount).toFixed(2)} · requiere pagar las anteriores`,
    });
  }

  const totalAll = invoices.reduce((s, i) => s + parseFloat(i.amount), 0);
  rows.push({
    id:          'inv_all',
    title:       '☑️ Pagar todas',
    description: `Total: BOB ${totalAll.toFixed(2)}`,
  });

  if (selectedIds.length > 0) {
    const totalSel = invoices
      .filter((i) => selectedIds.includes(i.id))
      .reduce((s, i) => s + parseFloat(i.amount), 0);
    rows.push({
      id:          'inv_confirm',
      title:       '💳 Confirmar pago',
      description: `${selectedIds.length} factura(s) · BOB ${totalSel.toFixed(2)}`,
    });
  }

  return rows;
};

/** Texto del resumen de facturas seleccionadas */
const buildSummary = (invoices, selectedIds) => {
  const selected = invoices.filter((i) => selectedIds.includes(i.id));
  const total    = selected.reduce((s, i) => s + parseFloat(i.amount), 0);
  let text = `📋 *Resumen de facturas a pagar:*\n\n`;
  for (const inv of selected) {
    text += `• ${inv.period} — *BOB ${parseFloat(inv.amount).toFixed(2)}*\n`;
  }
  text += `\n💰 *Total: BOB ${total.toFixed(2)}*`;
  return { text, total, selected };
};

// ── Handler principal ─────────────────────────────────────────────────────────

const handle = async ({
  msg, input, contact, conversation,
  session, sessionService, sendBuilderMessage, MessageBuilder,
}) => {
  const phone = contact.phone;
  const step  = session.currentStep;
  const ctx   = session.context || {};

  // ══════════════════════════════════════════════════════
  //  START — mostrar lista de compañías disponibles
  // ══════════════════════════════════════════════════════
  if (step === 'start') {
    const serviceType = ctx.serviceType || 'agua';
    const companies   = getCompaniesByService(serviceType);

    if (!companies.length) {
      await sendBuilderMessage({
        to: phone, method: 'sendText',
        text: '⚠️ No hay compañías disponibles para ese servicio.',
      });
      await sessionService.resetSession(conversation.id);
      await sendBuilderMessage(MessageBuilder.mainMenu(phone));
      return;
    }

    const serviceLabel = { agua: 'Agua', electricidad: 'Electricidad', internet: 'Internet / Telefonía' }[serviceType] || serviceType;

    await sendBuilderMessage({
      to:         phone,
      method:     'sendList',
      body:       `Seleccioná tu compañía de *${serviceLabel}*:`,
      header:     `Compañías disponibles`,
      footer:     '',
      buttonText: 'Ver compañías',
      sections:   [{ title: `Compañías de ${serviceLabel}`, rows: buildCompanyRows(companies) }],
    });

    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_company_sel' });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  WAITING_COMPANY_SEL — usuario elige compañía
  // ══════════════════════════════════════════════════════
  if (step === 'waiting_company_sel') {
    if (!input.startsWith('cmp_')) {
      await sessionService.incrementRetry(conversation.id);
      const companies   = getCompaniesByService(ctx.serviceType || 'agua');
      const serviceLabel = { agua: 'Agua', electricidad: 'Electricidad', internet: 'Internet' }[ctx.serviceType] || ctx.serviceType;
      await sendBuilderMessage({
        to: phone, method: 'sendList',
        body: 'Seleccioná una compañía de la lista:',
        header: 'Compañías disponibles', footer: '', buttonText: 'Ver compañías',
        sections: [{ title: `Compañías de ${serviceLabel}`, rows: buildCompanyRows(companies) }],
      });
      return;
    }

    const companyId = input.replace(/^cmp_/, '');
    const meta      = getCompanyMeta(companyId);

    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_customer_id',
      context:     { companyId, companyName: companyId },
      retryCount:  0,
    });

    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text:
        `✅ *${ctx.service || 'Servicio'} · ${companyId}*\n\n` +
        `Ingresá tu *${meta.idLabel}*:\n\n_${meta.idExample}_`,
    });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  WAITING_CUSTOMER_ID — validar número y cargar facturas
  // ══════════════════════════════════════════════════════
  if (step === 'waiting_customer_id') {
    const rawId  = (msg.text || '').trim();
    const meta   = getCompanyMeta(ctx.companyId);

    if (!rawId || rawId.length < 3) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone, method: 'sendText',
        text: `⚠️ Ingresá un número válido (${meta.idExample}).`,
      });
      return;
    }

    const customer = findCustomer(ctx.companyId, rawId);

    if (!customer) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone, method: 'sendText',
        text:
          `❌ No encontré ninguna cuenta con el número *${rawId}* en *${ctx.companyId}*.\n\n` +
          `Verificá el número e intentá de nuevo.`,
      });
      return;
    }

    // Sin deudas → felicitamos y reseteamos
    if (!customer.invoices.length) {
      await sendBuilderMessage({
        to: phone, method: 'sendButtons',
        body:
          `✅ Cuenta *${rawId}* — ${customer.name}\n\n` +
          `🎉 ¡Estás al día! No tenés facturas pendientes con *${ctx.companyId}*.`,
        buttons: [
          { id: 'flow_service', title: '🏠 Otros servicios' },
          { id: 'flow_menu',    title: '📋 Menú principal'  },
        ],
      });
      await sessionService.resetSession(conversation.id);
      return;
    }

    // Guardar datos del cliente en contexto
    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_invoice_sel',
      context: {
        customerId:         rawId,
        customerName:       customer.name,
        customerAddress:    customer.address,
        availableInvoices:  customer.invoices,
        selectedInvoiceIds: [],
      },
      retryCount: 0,
    });

    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text:
        `✅ *Cuenta encontrada*\n\n` +
        `👤 ${customer.name}\n` +
        `📍 ${customer.address}\n` +
        `🏢 ${ctx.companyId}\n\n` +
        `Tenés *${customer.invoices.length} factura(s) pendiente(s)*.\n\n` +
        `📌 _Las facturas se pagan en orden, de la más antigua a la más reciente. ` +
        `Tocá hasta qué factura querés pagar y se incluirán todas las anteriores automáticamente._`,
    });

    await sendBuilderMessage({
      to:         phone,
      method:     'sendList',
      body:       'Tocá la última factura que querés incluir en este pago:',
      header:     `${ctx.companyId} — Facturas pendientes`,
      footer:     'Se incluyen todas desde la más antigua hasta la que elijas',
      buttonText: 'Ver facturas',
      sections:   [{ title: 'Facturas pendientes', rows: buildInvoiceRows(customer.invoices, []) }],
    });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  WAITING_INVOICE_SEL — toggle de facturas
  // ══════════════════════════════════════════════════════
  if (step === 'waiting_invoice_sel') {
    let selectedIds = [...(ctx.selectedInvoiceIds || [])];
    const invoices  = ctx.availableInvoices || [];

    // ── Confirmar selección ──────────────────────────
    if (input === 'inv_confirm') {
      if (!selectedIds.length) {
        await sendBuilderMessage({
          to: phone, method: 'sendText',
          text: '⚠️ No seleccionaste ninguna factura. Tocá al menos una para continuar.',
        });
        return;
      }
      await sessionService.updateSession(conversation.id, { currentStep: 'confirming_selection' });
      const s = await sessionService.getSession(conversation.id);
      return handle({ msg, input, contact, conversation, session: s, sessionService, sendBuilderMessage, MessageBuilder });
    }

    // ── Seleccionar todas ────────────────────────────
    if (input === 'inv_all') {
      selectedIds = invoices.map((i) => i.id);
      await sessionService.updateSession(conversation.id, {
        currentStep: 'confirming_selection',
        context:     { selectedInvoiceIds: selectedIds },
      });
      const s = await sessionService.getSession(conversation.id);
      return handle({ msg, input: '__all', contact, conversation, session: s, sessionService, sendBuilderMessage, MessageBuilder });
    }

    // ── Selección acumulativa obligatoria ───────────
    if (input.startsWith('inv_')) {
      const invoiceId = input.replace(/^inv_/, '');
      const inv       = invoices.find((i) => i.id === invoiceId);

      if (!inv) {
        await sessionService.incrementRetry(conversation.id);
        await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Factura no válida.' });
        return;
      }

      // Si el usuario toca la única factura ya seleccionada → deselecciona todo
      // En cualquier otro caso → selecciona todas desde la primera hasta ésta (inclusive)
      const isSoleSelected = selectedIds.length === 1 && selectedIds[0] === invoiceId;
      selectedIds = isSoleSelected ? [] : selectUpTo(invoices, invoiceId);

      await sessionService.updateSession(conversation.id, {
        context:    { selectedInvoiceIds: selectedIds },
        retryCount: 0,
      });

      let feedbackText;
      if (!selectedIds.length) {
        feedbackText = `_Selección borrada. Tocá una factura para empezar._`;
      } else {
        const total   = invoices
          .filter((i) => selectedIds.includes(i.id))
          .reduce((s, i) => s + parseFloat(i.amount), 0);
        const periods = invoices
          .filter((i) => selectedIds.includes(i.id))
          .map((i) => i.period)
          .join(' · ');
        feedbackText =
          `✅ *${selectedIds.length} factura(s) seleccionada(s):*\n` +
          `${periods}\n\n` +
          `💰 Total: *BOB ${total.toFixed(2)}*\n\n` +
          `_Podés confirmar o tocar otra factura para ajustar._`;
      }

      await sendBuilderMessage({ to: phone, method: 'sendText', text: feedbackText });
      await sendBuilderMessage({
        to:         phone,
        method:     'sendList',
        body:       selectedIds.length > 0
          ? `${selectedIds.length} incluida(s). Confirmá o cambiá la selección.`
          : 'Tocá la última factura que querés incluir en este pago:',
        header:     `${ctx.companyId} — Facturas`,
        footer:     'Se incluyen todas desde la más antigua hasta la que elijas',
        buttonText: 'Ver facturas',
        sections:   [{ title: 'Facturas pendientes', rows: buildInvoiceRows(invoices, selectedIds) }],
      });
      return;
    }

    // Input no reconocido
    await sessionService.incrementRetry(conversation.id);
    await sendBuilderMessage({
      to: phone, method: 'sendList',
      body: 'Seleccioná una opción de la lista.',
      header: `${ctx.companyId} — Facturas`, footer: '', buttonText: 'Ver facturas',
      sections: [{ title: 'Facturas pendientes', rows: buildInvoiceRows(invoices, ctx.selectedInvoiceIds || []) }],
    });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  CONFIRMING_SELECTION — mostrar resumen y pedir OK
  // ══════════════════════════════════════════════════════
  if (step === 'confirming_selection') {
    const invoices    = ctx.availableInvoices  || [];
    const selectedIds = ctx.selectedInvoiceIds || [];
    const { text, total } = buildSummary(invoices, selectedIds);

    await sendBuilderMessage({ to: phone, method: 'sendText', text });
    await sendBuilderMessage({
      to: phone, method: 'sendButtons',
      body: '¿Confirmás el pago?',
      buttons: [
        { id: 'bill_confirm', title: '✅ Sí, pagar'  },
        { id: 'bill_cancel',  title: '❌ Cancelar'   },
      ],
    });
    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_confirmation',
      context:     { totalAmount: total },
    });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  WAITING_CONFIRMATION — procesar sí / no
  // ══════════════════════════════════════════════════════
  if (step === 'waiting_confirmation') {
    const isConfirm = input === 'bill_confirm' || CONFIRM_WORDS.includes(input);
    const isCancel  = input === 'bill_cancel'  || CANCEL_WORDS.includes(input);

    // ── Confirmar → generar QR ───────────────────────
    if (isConfirm) {
      await sendBuilderMessage({
        to: phone, method: 'sendText',
        text: '⏳ Generando tu QR de pago...',
      });

      try {
        const invoiceIds  = ctx.selectedInvoiceIds || [];
        const description = `Facturas ${ctx.companyId} (${invoiceIds.join(', ')})`.slice(0, 280);

        const pr = await generatePaymentQR({
          conversationId: conversation.id,
          contactId:      contact.id,
          amount:         ctx.totalAmount,
          description,
          bank:           process.env.PAYCENTER_DEFAULT_BANK || 'bmsc',
          expiresMinutes: 10,
        });

        await sessionService.updateSession(conversation.id, {
          currentStep: 'waiting_payment',
          context: {
            paymentRequestId: pr.id,
            qrExpiry:         Date.now() + QR_TIMEOUT_MS,
            paidInvoiceIds:   invoiceIds,
          },
        });

        if (pr.qr_base64) {
          await sendBuilderMessage({
            to:     phone,
            method: 'sendImage',
            url:    `data:image/png;base64,${pr.qr_base64}`,
            caption:
              `💳 *QR de Pago — ${ctx.companyId}*\n\n` +
              `Monto: *BOB ${parseFloat(ctx.totalAmount).toFixed(2)}*\n` +
              `Ref: ${pr.paycenter_order_id}\n\n` +
              `⏳ Tenés *10 minutos* para completar el pago.\n` +
              `Abrí la app de tu banco → Pagos QR → Escanear.`,
          });
        } else {
          await sendBuilderMessage({
            to: phone, method: 'sendText',
            text:
              `✅ *QR generado*\n\n` +
              `Monto: *BOB ${parseFloat(ctx.totalAmount).toFixed(2)}*\n` +
              `Ref: \`${pr.paycenter_order_id}\`\n\n` +
              `⏳ Tenés *10 minutos* para completar el pago.\n` +
              `_Abrí la app de tu banco → Pagos QR → Escanear._`,
          });
        }

        await sendBuilderMessage({
          to: phone, method: 'sendText',
          text: `ℹ️ Te notificaremos automáticamente cuando confirmemos tu pago.`,
        });

      } catch (err) {
        logger.error('[BillPayment] Error generando QR:', err.message);
        await sendBuilderMessage({
          to: phone, method: 'sendButtons',
          body: '⚠️ No pudimos generar el QR. ¿Qué deseas hacer?',
          buttons: [
            { id: 'bill_confirm', title: '🔄 Reintentar'    },
            { id: 'flow_menu',    title: '📋 Menú principal' },
          ],
        });
        await sessionService.updateSession(conversation.id, { currentStep: 'waiting_confirmation' });
      }
      return;
    }

    // ── Cancelar → preguntar qué hacer ──────────────
    if (isCancel) {
      await sendBuilderMessage({
        to: phone, method: 'sendButtons',
        body: '¿Qué deseas hacer?',
        buttons: [
          { id: 'bill_back', title: '🔙 Volver a facturas' },
          { id: 'flow_menu', title: '📋 Menú principal'    },
        ],
      });
      await sessionService.updateSession(conversation.id, { currentStep: 'waiting_cancel_decision' });
      return;
    }

    // Input no reconocido
    await sessionService.incrementRetry(conversation.id);
    await sendBuilderMessage({
      to: phone, method: 'sendButtons',
      body: `¿Confirmás el pago de *BOB ${parseFloat(ctx.totalAmount || 0).toFixed(2)}*?`,
      buttons: [
        { id: 'bill_confirm', title: '✅ Sí, pagar' },
        { id: 'bill_cancel',  title: '❌ Cancelar'  },
      ],
    });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  WAITING_CANCEL_DECISION — volver o ir al menú
  //  (timeout 30 min → manejado por TTL de sesión del engine)
  // ══════════════════════════════════════════════════════
  if (step === 'waiting_cancel_decision') {
    if (input === 'bill_back') {
      await sessionService.updateSession(conversation.id, {
        currentStep: 'waiting_invoice_sel',
        context:     { selectedInvoiceIds: [] },
        retryCount:  0,
      });
      const invoices = ctx.availableInvoices || [];
      await sendBuilderMessage({
        to: phone, method: 'sendList',
        body: 'Tocá la última factura que querés incluir en este pago:',
        header: `${ctx.companyId} — Facturas`, footer: 'Se incluyen todas desde la más antigua hasta la que elijas',
        buttonText: 'Ver facturas',
        sections: [{ title: 'Facturas pendientes', rows: buildInvoiceRows(invoices, []) }],
      });
      return;
    }

    if (input === 'flow_menu') {
      await sessionService.resetSession(conversation.id);
      await sendBuilderMessage(MessageBuilder.mainMenu(phone));
      return;
    }

    await sessionService.incrementRetry(conversation.id);
    await sendBuilderMessage({
      to: phone, method: 'sendButtons',
      body: '¿Qué deseas hacer?',
      buttons: [
        { id: 'bill_back', title: '🔙 Volver a facturas' },
        { id: 'flow_menu', title: '📋 Menú principal'    },
      ],
    });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  WAITING_PAYMENT — QR activo; usuario escribe algo
  //  La confirmación/expiración la gestiona qr-polling.service
  // ══════════════════════════════════════════════════════
  if (step === 'waiting_payment') {
    const expiryMs    = ctx.qrExpiry ? ctx.qrExpiry - Date.now() : 0;
    const minutesLeft = Math.max(0, Math.ceil(expiryMs / 60_000));

    if (expiryMs <= 0) {
      await sendBuilderMessage({
        to: phone, method: 'sendButtons',
        body: `⏰ Tu QR venció. Iniciá el proceso nuevamente para pagar.`,
        buttons: [
          { id: 'flow_service', title: '🏠 Pagar servicio' },
          { id: 'flow_menu',    title: '📋 Menú principal'  },
        ],
      });
      await sessionService.resetSession(conversation.id);
      return;
    }

    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text:
        `⏳ *Tu QR está activo.*\n\n` +
        `Monto: *BOB ${parseFloat(ctx.totalAmount || 0).toFixed(2)}*\n` +
        `Tiempo restante: *${minutesLeft} minuto(s)*\n\n` +
        `Escanéalo con la app de tu banco para completar el pago.\n` +
        `Te avisaremos automáticamente cuando lo confirmemos.`,
    });
    return;
  }

  // Fallback
  await sessionService.resetSession(conversation.id);
  await sendBuilderMessage(MessageBuilder.mainMenu(phone));
};

module.exports = { handle };
