/**
 * Agente Agenda
 * ─────────────
 * Gestión de citas del cliente via WhatsApp:
 *   - Ver próximas citas
 *   - Cancelar una cita
 *   - Iniciar reagendamiento (cancela + redirige a booking)
 *
 * Este agente se invoca como flujo "agenda" desde el orquestador o el menú.
 * Pasos: start → (selecting_action) → (cancelling) → done
 */

const { Appointment, Service } = require('../../models/index');
const { Op } = require('sequelize');
const logger = require('../../config/logger');

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Formatea una cita para mostrar en WhatsApp.
 */
const formatAppointment = (appt, service) => {
  const time  = (appt.start_time || '').substring(0, 5);
  const day   = DAYS_ES[new Date(appt.appointment_date + 'T00:00:00').getDay()] || '';
  const emoji = service?.emoji || '📅';
  const statusMap = {
    pending:         '⏳ Pendiente',
    confirmed:       '✅ Confirmada',
    pending_payment: '💳 Pago pendiente',
    paid:            '✅ Pagada',
    cancelled:       '❌ Cancelada',
    no_show:         '🚫 No asistió',
    completed:       '✔️ Completada',
  };
  const statusLabel = statusMap[appt.status] || appt.status;

  return `${emoji} *${service?.name || 'Cita'}*\n📅 ${day} ${appt.appointment_date} · 🕐 ${time}\nEstado: ${statusLabel}`;
};

/**
 * Flujo principal del Agente Agenda.
 */
const handle = async ({ msg, input, contact, conversation, session, sessionService, sendBuilderMessage }) => {
  const phone = contact.phone;
  const step  = session.currentStep;

  // ── INICIO: listar próximas citas ─────────────────────
  if (step === 'start') {
    const today = new Date().toISOString().split('T')[0];

    const appointments = await Appointment.findAll({
      where: {
        contact_id: contact.id,
        appointment_date: { [Op.gte]: today },
        status: { [Op.in]: ['pending', 'confirmed', 'pending_payment', 'paid'] },
      },
      include: [{ model: Service, as: 'service' }],
      order: [['appointment_date', 'ASC'], ['start_time', 'ASC']],
      limit: 5,
    });

    if (!appointments.length) {
      await sendBuilderMessage({
        to: phone,
        method: 'sendButtons',
        body: '📅 No tenés citas próximas agendadas.',
        buttons: [
          { id: 'flow_booking', title: '📅 Agendar una cita' },
          { id: 'flow_menu',    title: '📋 Ir al menú' },
        ],
      });
      await sessionService.resetSession(conversation.id);
      return;
    }

    // Mostrar lista de citas con opción de gestión
    const rows = appointments.map((appt) => {
      const svc  = appt.service;
      const time = (appt.start_time || '').substring(0, 5);
      const day  = DAYS_ES[new Date(appt.appointment_date + 'T00:00:00').getDay()] || '';
      return {
        id:          `appt_${appt.id}`,
        title:       `${svc?.emoji || '📅'} ${svc?.name || 'Cita'}`.substring(0, 24),
        description: `${day} ${appt.appointment_date} · ${time}`,
      };
    });

    await sendBuilderMessage({
      to: phone,
      method: 'sendList',
      header: 'Mis citas',
      body: `📋 Tenés *${appointments.length}* cita${appointments.length > 1 ? 's' : ''} próxima${appointments.length > 1 ? 's' : ''}.\n\nSeleccioná una para ver opciones:`,
      footer: 'Tocá una cita para gestionarla',
      buttonText: 'Ver mis citas',
      sections: [{ title: 'Próximas citas', rows }],
    });

    // Guardar IDs disponibles en contexto para validar la selección
    await sessionService.updateSession(conversation.id, {
      currentStep: 'selecting_appointment',
      context: { appointmentIds: appointments.map((a) => a.id) },
      retryCount: 0,
    });
    return;
  }

  // ── SELECCIONANDO CITA ────────────────────────────────
  if (step === 'selecting_appointment') {
    if (!input.startsWith('appt_')) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '⚠️ Seleccioná una cita de la lista.',
      });
      return;
    }

    const apptId = parseInt(input.replace('appt_', ''));
    const appt   = await Appointment.findOne({
      where: { id: apptId, contact_id: contact.id },
      include: [{ model: Service, as: 'service' }],
    });

    if (!appt) {
      await sessionService.incrementRetry(conversation.id);
      await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Cita no encontrada.' });
      return;
    }

    const detail = formatAppointment(appt, appt.service);

    await sendBuilderMessage({
      to: phone,
      method: 'sendButtons',
      header: 'Gestionar cita',
      body: `${detail}\n\n¿Qué deseas hacer?`,
      buttons: [
        { id: `cancel_appt_${appt.id}`,    title: '❌ Cancelar cita' },
        { id: `reschedule_appt_${appt.id}`, title: '🔄 Reagendar' },
      ],
    });

    await sessionService.updateSession(conversation.id, {
      currentStep: 'managing_appointment',
      context: { selectedApptId: appt.id },
      retryCount: 0,
    });
    return;
  }

  // ── GESTIONANDO CITA ──────────────────────────────────
  if (step === 'managing_appointment') {
    const { selectedApptId } = session.context;

    // Cancelar cita
    if (input.startsWith('cancel_appt_')) {
      const apptId = parseInt(input.replace('cancel_appt_', ''));
      if (apptId !== selectedApptId) {
        await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Acción inválida.' });
        return;
      }

      // Confirmar cancelación
      await sendBuilderMessage({
        to: phone,
        method: 'sendButtons',
        body: '¿Confirmás que querés *cancelar* esta cita?',
        footer: 'Esta acción no se puede deshacer',
        buttons: [
          { id: `confirm_cancel_${apptId}`, title: '✅ Sí, cancelar' },
          { id: 'flow_menu',                title: '🔙 Volver al menú' },
        ],
      });

      await sessionService.updateSession(conversation.id, {
        currentStep: 'confirming_cancel',
        retryCount: 0,
      });
      return;
    }

    // Reagendar cita
    if (input.startsWith('reschedule_appt_')) {
      const apptId = parseInt(input.replace('reschedule_appt_', ''));
      const appt   = await Appointment.findByPk(apptId);

      if (appt) {
        await appt.update({ status: 'cancelled', cancelled_at: new Date() });
        logger.info(`Cita ${apptId} cancelada para reagendamiento`);
      }

      await sendBuilderMessage({
        to: phone,
        method: 'sendText',
        text: '🔄 Cita cancelada. Te llevo al formulario de reagendamiento...',
      });

      // Redirigir al flujo de booking
      await sessionService.updateSession(conversation.id, {
        currentFlow: 'booking',
        currentStep: 'start',
        context: {},
        retryCount: 0,
      });

      // El bot.engine procesará el siguiente mensaje ya en booking
      // Pero iniciamos el flujo directamente enviando la lista de servicios
      const bookingFlow = require('../bot/flows/booking.flow');
      const updatedSession = await sessionService.getSession(conversation.id);
      await bookingFlow.handle({
        msg, input: 'start', contact, conversation,
        session: updatedSession, sessionService, sendBuilderMessage,
        MessageBuilder: require('../whatsapp/message.builder'),
      });
      return;
    }

    await sessionService.incrementRetry(conversation.id);
    await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Usá los botones para elegir.' });
    return;
  }

  // ── CONFIRMANDO CANCELACIÓN ───────────────────────────
  if (step === 'confirming_cancel') {
    if (input.startsWith('confirm_cancel_')) {
      const apptId = parseInt(input.replace('confirm_cancel_', ''));
      const appt   = await Appointment.findOne({
        where: { id: apptId, contact_id: contact.id },
        include: [{ model: Service, as: 'service' }],
      });

      if (!appt) {
        await sendBuilderMessage({ to: phone, method: 'sendText', text: '⚠️ Cita no encontrada.' });
        await sessionService.resetSession(conversation.id);
        return;
      }

      await appt.update({ status: 'cancelled', cancelled_at: new Date() });
      logger.info(`Cita ${apptId} cancelada por cliente ${contact.phone}`);

      const time    = (appt.start_time || '').substring(0, 5);
      const svcName = appt.service?.name || 'Cita';

      await sendBuilderMessage({
        to: phone,
        method: 'sendButtons',
        body: `✅ Cita cancelada correctamente.\n\n❌ *${svcName}*\n📅 ${appt.appointment_date} · 🕐 ${time}\n\n¿Deseás agendar una nueva cita?`,
        buttons: [
          { id: 'flow_booking', title: '📅 Agendar nueva cita' },
          { id: 'flow_menu',    title: '📋 Ir al menú' },
        ],
      });

      await sessionService.resetSession(conversation.id);
      return;
    }

    // Si dice que no cancela → volver al menú
    await sessionService.resetSession(conversation.id);
    await sendBuilderMessage({
      to: phone,
      method: 'sendText',
      text: '👍 Cancelación descartada. Tu cita sigue activa.\n\nEscribí *menú* para volver al inicio.',
    });
    return;
  }
};

module.exports = { handle };
