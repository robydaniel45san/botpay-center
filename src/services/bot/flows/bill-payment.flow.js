/**
 * bill-payment.flow.js — Pago de facturas de servicios públicos
 * RAMA: chatbot-bridge — conecta con APIs reales vía signed.client
 *
 * Para agregar una empresa nueva:
 *   1. Registrarla en service.registry.js con su URL y auth
 *   2. Añadirla al mapa COMPANIES de este archivo
 *   Sin más cambios.
 *
 * Pasos del flujo:
 *   start                → lista de compañías por servicio
 *   waiting_company_sel  → elige compañía
 *   waiting_customer_id  → ingresa número de medidor/contrato
 *   waiting_invoice_sel  → selección acumulativa de facturas
 *   confirming_selection → resumen + confirmar
 *   waiting_confirmation → sí / no
 *   waiting_payment      → QR activo (qr-polling confirma)
 */

const { generatePaymentQR } = require('../../paycenter/qr.service');
const signedClient           = require('../../../infrastructure/services/signed.client');
const logger                 = require('../../../config/logger');

const QR_TIMEOUT_MS = 10 * 60 * 1000;
const CONFIRM_WORDS = ['si', 'sí', 'yes', 'ok', 'dale', 'confirmar', 'confirmo', '1', 'bueno', 'claro'];
const CANCEL_WORDS  = ['no', 'cancelar', 'cancel', 'nop', 'nope', '2'];

// ── Mapa de compañías por tipo de servicio ────────────────────────────────────
// Cada entrada referencia un serviceId registrado en service.registry.js
const COMPANIES = {
  agua: [
    { id: 'saguapac', name: 'SAGUAPAC',  logo: '💧', description: 'Servicio de agua Cochabamba' },
    { id: 'semapa',   name: 'SEMAPA',    logo: '💧', description: 'Servicio municipal de agua' },
  ],
  electricidad: [
    { id: 'elfec',    name: 'ELFEC',     logo: '⚡', description: 'Electricidad Cochabamba' },
    { id: 'cre',      name: 'CRE',       logo: '⚡', description: 'Cooperativa Rural de Electrificación' },
  ],
  internet: [
    { id: 'entel',    name: 'ENTEL',     logo: '📡', description: 'Telefonía e internet ENTEL' },
    { id: 'tigo',     name: 'Tigo',      logo: '📡', description: 'Internet y telefonía Tigo' },
    { id: 'viva',     name: 'Viva',      logo: '📡', description: 'Internet y telefonía Viva' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const buildCompanyRows = (companies) =>
  companies.map((c) => ({
    id:          `cmp_${c.id}`,
    title:       `${c.logo} ${c.name}`,
    description: c.description,
  }));

/**
 * Selección acumulativa obligatoria (lógica Bolivia):
 * Tocar una factura selecciona TODAS desde la primera hasta esa inclusive.
 */
const selectUpTo = (invoices, targetId) => {
  const idx = invoices.findIndex((i) => i.id === targetId);
  if (idx === -1) return [];
  return invoices.slice(0, idx + 1).map((i) => i.id);
};

const buildInvoiceRows = (invoices, selectedIds) => {
  const rows = invoices.map((inv, i) => {
    const isSelected = selectedIds.includes(inv.id);
    const isNext     = !isSelected && i === selectedIds.length;
    return {
      id:    `inv_${inv.id}`,
      title: `${isSelected ? '✅' : '📋'} ${inv.period}`,
      description: isSelected
        ? `BOB ${parseFloat(inv.amount).toFixed(2)} · incluida`
        : isNext
          ? `BOB ${parseFloat(inv.amount).toFixed(2)} · tocá para agregar hasta acá`
          : `BOB ${parseFloat(inv.amount).toFixed(2)} · requiere pagar las anteriores`,
    };
  });

  const totalAll = invoices.reduce((s, i) => s + parseFloat(i.amount), 0);
  rows.push({ id: 'inv_all',     title: '☑️ Pagar todas',   description: `Total: BOB ${totalAll.toFixed(2)}` });

  if (selectedIds.length > 0) {
    const totalSel = invoices
      .filter((i) => selectedIds.includes(i.id))
      .reduce((s, i) => s + parseFloat(i.amount), 0);
    rows.push({ id: 'inv_confirm', title: '💳 Confirmar pago', description: `${selectedIds.length} factura(s) · BOB ${totalSel.toFixed(2)}` });
  }
  return rows;
};

const buildSummary = (invoices, selectedIds) => {
  const selected = invoices.filter((i) => selectedIds.includes(i.id));
  const total    = selected.reduce((s, i) => s + parseFloat(i.amount), 0);
  let text = `📋 *Resumen de facturas a pagar:*\n\n`;
  for (const inv of selected) text += `• ${inv.period} — *BOB ${parseFloat(inv.amount).toFixed(2)}*\n`;
  text += `\n💰 *Total: BOB ${total.toFixed(2)}*`;
  return { text, total, selected };
};

// ── Llamadas a APIs reales ────────────────────────────────────────────────────

/**
 * Consulta facturas pendientes del cliente en la API de la empresa.
 * El endpoint puede variar por empresa — aquí se normaliza la respuesta.
 */
const fetchCustomerData = async (serviceId, customerId) => {
  const client = signedClient.for(serviceId);
  const { data } = await client.get(`/cliente/${customerId}`);

  // Normalizar respuesta al formato interno { name, address, invoices[] }
  // Cada empresa puede tener estructura diferente — adaptar aquí si es necesario
  return {
    name:     data.nombre || data.name       || data.titular || customerId,
    address:  data.direccion || data.address || '',
    invoices: (data.facturas || data.invoices || data.cuotas || []).map((f) => ({
      id:     f.id   || f.factura_id || f.codigo,
      period: f.periodo || f.period  || f.mes,
      amount: f.monto   || f.amount  || f.importe,
      due:    f.vencimiento || f.due  || f.fecha_vencimiento || '',
    })),
  };
};

/**
 * Notifica a la empresa el pago realizado.
 */
const notifyPayment = async (serviceId, customerId, invoiceIds, referencia, monto) => {
  try {
    const client = signedClient.for(serviceId);
    await client.post('/facturas/pagar', {
      medidor:          customerId,
      factura_ids:      invoiceIds,
      referencia_pago:  referencia,
      monto_total:      monto,
      banco:            process.env.PAYCENTER_DEFAULT_BANK || 'bmsc',
    });
  } catch (err) {
    // No bloquear la confirmación si la empresa no responde
    logger.warn(`[BillPayment] No se pudo notificar pago a ${serviceId}:`, err.message);
  }
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
  //  START — lista de compañías
  // ══════════════════════════════════════════════════════
  if (step === 'start') {
    const serviceType  = ctx.serviceType || 'agua';
    const companies    = COMPANIES[serviceType] || [];
    const serviceLabel = { agua: 'Agua', electricidad: 'Electricidad', internet: 'Internet' }[serviceType] || serviceType;

    if (!companies.length) {
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ No hay compañías disponibles para ese servicio.' });
      await sessionService.resetSession(conversation.id);
      await sendBuilderMessage(MessageBuilder.mainMenu(phone));
      return;
    }

    await sendBuilderMessage({
      to: phone, method: 'sendList',
      body: `Seleccioná tu compañía de *${serviceLabel}*:`,
      header: 'Compañías disponibles', footer: '', buttonText: 'Ver compañías',
      sections: [{ title: `Compañías de ${serviceLabel}`, rows: buildCompanyRows(companies) }],
    });
    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_company_sel' });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  WAITING_COMPANY_SEL
  // ══════════════════════════════════════════════════════
  if (step === 'waiting_company_sel') {
    if (!input.startsWith('cmp_')) {
      await sessionService.incrementRetry(conversation.id);
      const companies   = COMPANIES[ctx.serviceType || 'agua'] || [];
      const serviceLabel = { agua: 'Agua', electricidad: 'Electricidad', internet: 'Internet' }[ctx.serviceType] || '';
      await sendBuilderMessage({
        to: phone, method: 'sendList',
        body: 'Seleccioná una compañía de la lista:',
        header: 'Compañías disponibles', footer: '', buttonText: 'Ver compañías',
        sections: [{ title: `Compañías de ${serviceLabel}`, rows: buildCompanyRows(companies) }],
      });
      return;
    }

    const companyId  = input.replace(/^cmp_/, '');
    const allCompanies = Object.values(COMPANIES).flat();
    const company    = allCompanies.find((c) => c.id === companyId);

    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_customer_id',
      context:     { companyId, companyName: company?.name || companyId, companyLogo: company?.logo || '🏢' },
      retryCount:  0,
    });
    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text: `${company?.logo || '🏢'} *${company?.name || companyId}*\n\nIngresá tu *número de medidor o contrato*:`,
    });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  WAITING_CUSTOMER_ID — consulta a API real
  // ══════════════════════════════════════════════════════
  if (step === 'waiting_customer_id') {
    const rawId = (msg.text || '').trim();
    if (!rawId || rawId.length < 3) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Ingresá un número válido.' });
      return;
    }

    await sendBuilderMessage({ to: phone, method: 'sendText', text: '🔍 Consultando tus facturas...' });

    let customer;
    try {
      customer = await fetchCustomerData(ctx.companyId, rawId);
    } catch (err) {
      logger.error(`[BillPayment] Error consultando ${ctx.companyId}:`, err.message);
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone, method: 'sendText',
        text: `❌ No encontré datos para el número *${rawId}* en *${ctx.companyName}*.\n\nVerificá e intentá de nuevo.`,
      });
      return;
    }

    if (!customer.invoices.length) {
      await sendBuilderMessage({
        to: phone, method: 'sendButtons',
        body: `✅ *${customer.name}*\n\n🎉 ¡Estás al día! No tenés facturas pendientes con *${ctx.companyName}*.`,
        buttons: [
          { id: 'flow_service', title: '🏠 Otros servicios' },
          { id: 'flow_menu',    title: '📋 Menú principal'  },
        ],
      });
      await sessionService.resetSession(conversation.id);
      return;
    }

    await sessionService.updateSession(conversation.id, {
      currentStep: 'waiting_invoice_sel',
      context: {
        customerId:         rawId,
        customerName:       customer.name,
        availableInvoices:  customer.invoices,
        selectedInvoiceIds: [],
      },
      retryCount: 0,
    });

    await sendBuilderMessage({
      to: phone, method: 'sendText',
      text:
        `✅ *Cuenta encontrada*\n\n👤 ${customer.name}\n🏢 ${ctx.companyName}\n\n` +
        `Tenés *${customer.invoices.length} factura(s) pendiente(s)*.\n\n` +
        `📌 _Las facturas se pagan en orden. Tocá hasta qué factura querés pagar y se incluirán todas las anteriores automáticamente._`,
    });
    await sendBuilderMessage({
      to: phone, method: 'sendList',
      body: 'Tocá la última factura que querés incluir en este pago:',
      header: `${ctx.companyLogo} ${ctx.companyName}`,
      footer: 'Se incluyen todas desde la más antigua hasta la que elijas',
      buttonText: 'Ver facturas',
      sections: [{ title: 'Facturas pendientes', rows: buildInvoiceRows(customer.invoices, []) }],
    });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  WAITING_INVOICE_SEL
  // ══════════════════════════════════════════════════════
  if (step === 'waiting_invoice_sel') {
    let selectedIds = [...(ctx.selectedInvoiceIds || [])];
    const invoices  = ctx.availableInvoices || [];

    if (input === 'inv_confirm') {
      if (!selectedIds.length) {
        await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ No seleccionaste ninguna factura.' });
        return;
      }
      await sessionService.updateSession(conversation.id, { currentStep: 'confirming_selection' });
      const s = await sessionService.getSession(conversation.id);
      return handle({ msg, input, contact, conversation, session: s, sessionService, sendBuilderMessage, MessageBuilder });
    }

    if (input === 'inv_all') {
      selectedIds = invoices.map((i) => i.id);
      await sessionService.updateSession(conversation.id, {
        currentStep: 'confirming_selection',
        context:     { selectedInvoiceIds: selectedIds },
      });
      const s = await sessionService.getSession(conversation.id);
      return handle({ msg, input: '__all', contact, conversation, session: s, sessionService, sendBuilderMessage, MessageBuilder });
    }

    if (input.startsWith('inv_')) {
      const invoiceId      = input.replace(/^inv_/, '');
      const inv            = invoices.find((i) => i.id === invoiceId);
      if (!inv) { await sessionService.incrementRetry(conversation.id); return; }

      const isSoleSelected = selectedIds.length === 1 && selectedIds[0] === invoiceId;
      selectedIds = isSoleSelected ? [] : selectUpTo(invoices, invoiceId);

      await sessionService.updateSession(conversation.id, { context: { selectedInvoiceIds: selectedIds }, retryCount: 0 });

      let feedbackText;
      if (!selectedIds.length) {
        feedbackText = `_Selección borrada. Tocá una factura para empezar._`;
      } else {
        const total   = invoices.filter((i) => selectedIds.includes(i.id)).reduce((s, i) => s + parseFloat(i.amount), 0);
        const periods = invoices.filter((i) => selectedIds.includes(i.id)).map((i) => i.period).join(' · ');
        feedbackText  =
          `✅ *${selectedIds.length} factura(s) seleccionada(s):*\n${periods}\n\n` +
          `💰 Total: *BOB ${total.toFixed(2)}*\n\n_Confirmá o cambiá la selección._`;
      }

      await sendBuilderMessage({ to: phone, method: 'sendText', text: feedbackText });
      await sendBuilderMessage({
        to: phone, method: 'sendList',
        body: selectedIds.length > 0 ? `${selectedIds.length} incluida(s). Confirmá o cambiá.` : 'Tocá la última factura que querés incluir:',
        header: `${ctx.companyLogo} ${ctx.companyName}`,
        footer: 'Se incluyen todas desde la más antigua hasta la que elijas',
        buttonText: 'Ver facturas',
        sections: [{ title: 'Facturas pendientes', rows: buildInvoiceRows(invoices, selectedIds) }],
      });
      return;
    }

    await sessionService.incrementRetry(conversation.id);
    await sendBuilderMessage({
      to: phone, method: 'sendList',
      body: 'Seleccioná una opción:',
      header: `${ctx.companyLogo} ${ctx.companyName}`, footer: '', buttonText: 'Ver facturas',
      sections: [{ title: 'Facturas pendientes', rows: buildInvoiceRows(invoices, ctx.selectedInvoiceIds || []) }],
    });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  CONFIRMING_SELECTION
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
        { id: 'bill_confirm', title: '✅ Sí, pagar' },
        { id: 'bill_cancel',  title: '❌ Cancelar'  },
      ],
    });
    await sessionService.updateSession(conversation.id, { currentStep: 'waiting_confirmation', context: { totalAmount: total } });
    return;
  }

  // ══════════════════════════════════════════════════════
  //  WAITING_CONFIRMATION
  // ══════════════════════════════════════════════════════
  if (step === 'waiting_confirmation') {
    const isConfirm = input === 'bill_confirm' || CONFIRM_WORDS.includes(input);
    const isCancel  = input === 'bill_cancel'  || CANCEL_WORDS.includes(input);

    if (isConfirm) {
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⏳ Generando tu QR de pago...' });
      try {
        const invoiceIds  = ctx.selectedInvoiceIds || [];
        const description = `Facturas ${ctx.companyName} (${invoiceIds.join(', ')})`.slice(0, 280);

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
            companyId:        ctx.companyId,
            companyName:      ctx.companyName,
            customerId:       ctx.customerId,
            availableInvoices: ctx.availableInvoices,
          },
        });

        if (pr.qr_base64) {
          await sendBuilderMessage({
            to: phone, method: 'sendImage',
            url:     `data:image/png;base64,${pr.qr_base64}`,
            caption:
              `💳 *QR de Pago — ${ctx.companyName}*\n\n` +
              `Monto: *BOB ${parseFloat(ctx.totalAmount).toFixed(2)}*\n` +
              `Ref: ${pr.paycenter_order_id}\n\n` +
              `⏳ Tenés *10 minutos* para completar el pago.\n` +
              `Abrí la app de tu banco → Pagos QR → Escanear.`,
          });
        } else {
          await sendBuilderMessage({
            to: phone, method: 'sendText',
            text:
              `✅ *QR generado*\n\nMonto: *BOB ${parseFloat(ctx.totalAmount).toFixed(2)}*\n` +
              `Ref: \`${pr.paycenter_order_id}\`\n\n⏳ Tenés *10 minutos* para pagar.\n` +
              `_Abrí la app de tu banco → Pagos QR → Escanear._`,
          });
        }
        await sendBuilderMessage({ to: phone, method: 'sendText', text: `ℹ️ Te notificaremos automáticamente cuando confirmemos tu pago.` });

        // Notificar a la empresa del pago generado
        await notifyPayment(ctx.companyId, ctx.customerId, invoiceIds, pr.paycenter_order_id, ctx.totalAmount);

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
  //  WAITING_CANCEL_DECISION
  // ══════════════════════════════════════════════════════
  if (step === 'waiting_cancel_decision') {
    if (input === 'bill_back') {
      await sessionService.updateSession(conversation.id, { currentStep: 'waiting_invoice_sel', context: { selectedInvoiceIds: [] }, retryCount: 0 });
      const invoices = ctx.availableInvoices || [];
      await sendBuilderMessage({
        to: phone, method: 'sendList',
        body: 'Tocá la última factura que querés incluir en este pago:',
        header: `${ctx.companyLogo} ${ctx.companyName}`,
        footer: 'Se incluyen todas desde la más antigua hasta la que elijas',
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
  //  WAITING_PAYMENT
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
        `Escanéalo con la app de tu banco para completar el pago.`,
    });
    return;
  }

  await sessionService.resetSession(conversation.id);
  await sendBuilderMessage(MessageBuilder.mainMenu(phone));
};

module.exports = { handle };
