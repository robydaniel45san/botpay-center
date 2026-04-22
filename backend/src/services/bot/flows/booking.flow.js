const { Service, Appointment, ScheduleConfig, ScheduleBlock } = require('../../../models/index');
const { generatePaymentQR } = require('../../paycenter/qr.service');
const { Op } = require('sequelize');
const logger = require('../../../config/logger');

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Genera los slots disponibles para una fecha dada.
 */
const getAvailableSlots = async (date, durationMinutes) => {
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();

  const config = await ScheduleConfig.findOne({ where: { day_of_week: dayOfWeek, is_open: true } });
  if (!config) return [];

  // Verificar bloqueo del día completo
  const block = await ScheduleBlock.findOne({
    where: { date, block_type: 'full_day' },
  });
  if (block) return [];

  // Generar slots en el horario configurado
  const slots = [];
  const [openH, openM] = config.open_time.split(':').map(Number);
  const [closeH, closeM] = config.close_time.split(':').map(Number);
  const slotMins = config.slot_duration_minutes || 30;
  const breakStart = config.break_start ? config.break_start.split(':').map(Number) : null;
  const breakEnd = config.break_end ? config.break_end.split(':').map(Number) : null;

  let current = openH * 60 + openM;
  const closeTotal = closeH * 60 + closeM;

  while (current + durationMinutes <= closeTotal) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    // Saltar descanso
    if (breakStart && breakEnd) {
      const bStart = breakStart[0] * 60 + breakStart[1];
      const bEnd = breakEnd[0] * 60 + breakEnd[1];
      if (current >= bStart && current < bEnd) {
        current += slotMins;
        continue;
      }
    }
    slots.push(timeStr);
    current += slotMins;
  }

  // Filtrar slots ya ocupados
  const booked = await Appointment.findAll({
    where: {
      appointment_date: date,
      status: ['pending', 'confirmed', 'pending_payment', 'paid'],
    },
    attributes: ['start_time'],
  });
  const bookedTimes = new Set(booked.map((a) => a.start_time.substring(0, 5)));

  return slots.filter((s) => !bookedTimes.has(s));
};

/**
 * Flujo de agendamiento de citas.
 * Pasos: start → selecting_service → selecting_date → selecting_time → confirm → [payment] → done
 */
const handle = async ({ msg, input, contact, conversation, session, sessionService, sendBuilderMessage, MessageBuilder }) => {
  const phone = contact.phone;
  const step = session.currentStep;

  // ── INICIO: mostrar servicios ─────────────────────────
  if (step === 'start') {
    const services = await Service.findAll({ where: { status: 'active' }, order: [['sort_order', 'ASC']] });

    if (!services.length) {
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '😔 No hay servicios disponibles en este momento.\nEscribe *menú* para volver al inicio.',
      });
      await sessionService.resetSession(conversation.id);
      return;
    }

    // Agrupar por categoría
    const grouped = services.reduce((acc, s) => {
      const cat = s.category || 'Servicios';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push({
        id: `svc_${s.id}`,
        title: `${s.emoji || '✂️'} ${s.name}`.substring(0, 24),
        description: s.price ? `BOB ${parseFloat(s.price).toFixed(2)} · ${s.duration_minutes} min` : `${s.duration_minutes} min`,
      });
      return acc;
    }, {});

    const sections = Object.entries(grouped).map(([title, rows]) => ({ title, rows }));

    await sendBuilderMessage({
      to: phone,
      method: 'sendList',
      header: 'Agendar cita',
      body: '📅 Selecciona el servicio que deseas:',
      footer: 'Elige una opción de la lista',
      buttonText: 'Ver servicios',
      sections,
    });

    await sessionService.updateSession(conversation.id, { currentStep: 'selecting_service' });
    return;
  }

  // ── SELECCIONANDO SERVICIO ────────────────────────────
  if (step === 'selecting_service') {
    const serviceId = input.startsWith('svc_') ? parseInt(input.replace('svc_', '')) : null;
    if (!serviceId) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Selecciona un servicio de la lista.' });
      return;
    }

    const service = await Service.findOne({ where: { id: serviceId, status: 'active' } });
    if (!service) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Servicio no encontrado. Intenta de nuevo.' });
      return;
    }

    await sessionService.updateSession(conversation.id, {
      currentStep: 'selecting_date',
      context: { serviceId: service.id, serviceName: service.name, servicePrice: service.price, serviceDuration: service.duration_minutes, requiresAdvance: service.requires_advance_payment, advanceAmount: service.advance_payment_amount },
      retryCount: 0,
    });

    // Ofrecer los próximos 7 días con disponibilidad
    const today = new Date();
    const dateOptions = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const slots = await getAvailableSlots(dateStr, service.duration_minutes);
      if (slots.length > 0) {
        const dayName = DAYS_ES[d.getDay()];
        const dateLabel = `${d.getDate()}/${d.getMonth() + 1}`;
        dateOptions.push({ id: `date_${dateStr}`, title: `${dayName} ${dateLabel}`, description: `${slots.length} horarios disponibles` });
      }
    }

    if (!dateOptions.length) {
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '😔 No hay fechas disponibles esta semana. Escribe *menú* para volver.' });
      await sessionService.resetSession(conversation.id);
      return;
    }

    await sendBuilderMessage({
      to: phone,
      method: 'sendList',
      header: service.name,
      body: '📅 ¿Qué día prefieres?',
      buttonText: 'Ver fechas',
      sections: [{ title: 'Fechas disponibles', rows: dateOptions }],
    });
    return;
  }

  // ── SELECCIONANDO FECHA ───────────────────────────────
  if (step === 'selecting_date') {
    const date = input.startsWith('date_') ? input.replace('date_', '') : null;
    if (!date) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Selecciona una fecha de la lista.' });
      return;
    }

    const { serviceDuration } = session.context;
    const slots = await getAvailableSlots(date, serviceDuration);

    if (!slots.length) {
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '😔 No hay horarios para esa fecha. Elige otra.' });
      return;
    }

    // Mostrar horarios en grupos de 3 botones (limitado a 3 por Meta)
    // Si hay más de 3, usamos lista
    const rows = slots.slice(0, 10).map((s) => ({ id: `time_${s}`, title: `🕐 ${s}`, description: '' }));

    await sessionService.updateSession(conversation.id, {
      currentStep: 'selecting_time',
      context: { date },
      retryCount: 0,
    });

    await sendBuilderMessage({
      to: phone,
      method: 'sendList',
      body: `📅 *${date}* — Elige un horario:`,
      buttonText: 'Ver horarios',
      sections: [{ title: 'Horarios disponibles', rows }],
    });
    return;
  }

  // ── SELECCIONANDO HORA ────────────────────────────────
  if (step === 'selecting_time') {
    const time = input.startsWith('time_') ? input.replace('time_', '') : null;
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Selecciona un horario de la lista.' });
      return;
    }

    const { serviceName, servicePrice, date, requiresAdvance, advanceAmount } = session.context;
    await sessionService.updateSession(conversation.id, {
      currentStep: 'confirming',
      context: { time },
      retryCount: 0,
    });

    const priceText = servicePrice
      ? `💰 Precio: *BOB ${parseFloat(servicePrice).toFixed(2)}*`
      : '💰 Precio: *A convenir*';
    const advanceText = requiresAdvance
      ? `\n💳 Se requiere anticipo de *BOB ${parseFloat(advanceAmount || servicePrice).toFixed(2)}*`
      : '';

    await sendBuilderMessage({
      to: phone,
      method: 'sendButtons',
      header: '📋 Confirmar cita',
      body: `*${serviceName}*\n📅 ${date} a las 🕐 ${time}\n${priceText}${advanceText}`,
      footer: '¿Confirmas esta cita?',
      buttons: [
        { id: 'confirm_yes', title: '✅ Confirmar' },
        { id: 'confirm_no', title: '❌ Cancelar' },
      ],
    });
    return;
  }

  // ── CONFIRMACIÓN ──────────────────────────────────────
  if (step === 'confirming') {
    if (input === 'confirm_no') {
      await sessionService.resetSession(conversation.id);
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '❌ Cita cancelada.\n\nEscribe *menú* para volver al inicio.' });
      return;
    }

    if (input !== 'confirm_yes') {
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Usa los botones para confirmar o cancelar.' });
      return;
    }

    const { serviceId, serviceName, date, time, serviceDuration, requiresAdvance, advanceAmount, servicePrice } = session.context;

    // Calcular hora de fin
    const [h, m] = time.split(':').map(Number);
    const endMins = h * 60 + m + (serviceDuration || 60);
    const endTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;

    // Crear cita
    const appointment = await Appointment.create({
      contact_id: contact.id,
      conversation_id: conversation.id,
      service_id: serviceId,
      appointment_date: date,
      start_time: time,
      end_time: endTime,
      status: requiresAdvance ? 'pending_payment' : 'confirmed',
      confirmed_at: requiresAdvance ? null : new Date(),
    });

    await sessionService.updateSession(conversation.id, {
      context: { appointmentId: appointment.id },
    });

    if (requiresAdvance) {
      // Generar QR de anticipo
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⏳ Generando QR de pago anticipado...' });

      try {
        const paymentReq = await generatePaymentQR({
          conversationId: conversation.id,
          contactId: contact.id,
          amount: advanceAmount || servicePrice,
          description: `Anticipo — ${serviceName}`,
          bank: process.env.PAYCENTER_DEFAULT_BANK || 'bmsc',
        });

        await appointment.update({ payment_request_id: paymentReq.id, status: 'pending_payment' });

        await sendBuilderMessage({
          to: phone,
          method: 'sendText',
          text: `✅ *Cita registrada*\n📅 ${date} · 🕐 ${time}\n*${serviceName}*\n\nPara confirmarla, realiza el pago anticipado de *BOB ${parseFloat(advanceAmount || servicePrice).toFixed(2)}* con el QR a continuación:`,
        });

        if (paymentReq.qr_base64) {
          await sendBuilderMessage({
            to: phone,
            method: 'sendImage',
            url: `data:image/png;base64,${paymentReq.qr_base64}`,
            caption: `Anticipo ${serviceName} — BOB ${parseFloat(advanceAmount || servicePrice).toFixed(2)}`,
          });
        }
      } catch (err) {
        logger.error('Error generando QR anticipo:', err.message);
        await appointment.update({ status: 'confirmed', confirmed_at: new Date() });
        await sendBuilderMessage({ to: phone, method: 'sendText', text: `✅ *Cita confirmada*\n📅 ${date} · 🕐 ${time}\n*${serviceName}*\n\n_No se pudo generar el QR de anticipo. Te contactaremos para el pago._` });
      }
    } else {
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: `✅ *¡Cita confirmada!*\n\n📅 Fecha: *${date}*\n🕐 Hora: *${time}*\n💆 Servicio: *${serviceName}*\n\n_Recibirás un recordatorio 24 horas antes. Escribe *menú* para volver al inicio._`,
      });
    }

    await sessionService.resetSession(conversation.id);
  }
};

module.exports = { handle };
