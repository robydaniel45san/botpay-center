const cron = require('node-cron');
const { Op } = require('sequelize');
const { Appointment, Service, Contact } = require('../../models/index');
const whatsapp = require('../whatsapp/whatsapp.service');
const logger = require('../../config/logger');

/**
 * Envía recordatorio de cita al cliente por WhatsApp.
 */
const sendReminder = async (appointment, hoursLabel) => {
  const contact = appointment.contact || await Contact.findByPk(appointment.contact_id);
  const service = appointment.service || await Service.findByPk(appointment.service_id);
  if (!contact || !service) return;

  const time = appointment.start_time.substring(0, 5);
  const text =
    `🔔 *Recordatorio de cita*\n\n` +
    `Hola *${contact.name || contact.phone}*,\n` +
    `te recordamos que tienes una cita en *${hoursLabel}*:\n\n` +
    `${service.emoji || '✂️'} *${service.name}*\n` +
    `📅 ${appointment.appointment_date} · 🕐 ${time}\n\n` +
    `_Si necesitas cancelar o reagendar, escríbenos._`;

  await whatsapp.sendText(contact.phone, text);
  logger.info(`Recordatorio ${hoursLabel} enviado a ${contact.phone} cita=${appointment.id}`);
};

/**
 * Job de recordatorios 24 horas antes.
 * Corre cada hora a los :00 minutos.
 */
const schedule24hReminders = () => {
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();
      // Ventana: entre 23h y 25h desde ahora
      const from = new Date(now.getTime() + 23 * 60 * 60 * 1000);
      const to   = new Date(now.getTime() + 25 * 60 * 60 * 1000);

      const fromDate = from.toISOString().split('T')[0];
      const toDate   = to.toISOString().split('T')[0];
      const fromTime = from.toTimeString().substring(0, 8);
      const toTime   = to.toTimeString().substring(0, 8);

      const appointments = await Appointment.findAll({
        where: {
          reminder_24h_sent: false,
          status: { [Op.in]: ['confirmed', 'paid'] },
          [Op.and]: [
            { appointment_date: { [Op.between]: [fromDate, toDate] } },
          ],
        },
        include: [
          { model: Service, as: 'service' },
          { model: Contact, as: 'contact' },
        ],
      });

      for (const appt of appointments) {
        try {
          await sendReminder(appt, '24 horas');
          await appt.update({ reminder_24h_sent: true });
        } catch (err) {
          logger.error(`Error recordatorio 24h cita=${appt.id}:`, err.message);
        }
      }

      if (appointments.length) {
        logger.info(`Recordatorios 24h enviados: ${appointments.length}`);
      }
    } catch (err) {
      logger.error('Error en job recordatorios 24h:', err);
    }
  });

  logger.info('Cron recordatorios 24h activo');
};

/**
 * Job de recordatorios 1 hora antes.
 * Corre cada 15 minutos.
 */
const schedule1hReminders = () => {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const now = new Date();
      const from = new Date(now.getTime() + 45 * 60 * 1000);
      const to   = new Date(now.getTime() + 75 * 60 * 1000);

      const fromDate = from.toISOString().split('T')[0];
      const toDate   = to.toISOString().split('T')[0];

      const appointments = await Appointment.findAll({
        where: {
          reminder_1h_sent: false,
          status: { [Op.in]: ['confirmed', 'paid'] },
          appointment_date: { [Op.between]: [fromDate, toDate] },
        },
        include: [
          { model: Service, as: 'service' },
          { model: Contact, as: 'contact' },
        ],
      });

      for (const appt of appointments) {
        try {
          // Verificar que realmente sea dentro de 45-75 min
          const apptDateTime = new Date(`${appt.appointment_date}T${appt.start_time}`);
          const diff = apptDateTime - now;
          if (diff >= 45 * 60 * 1000 && diff <= 75 * 60 * 1000) {
            await sendReminder(appt, '1 hora');
            await appt.update({ reminder_1h_sent: true });
          }
        } catch (err) {
          logger.error(`Error recordatorio 1h cita=${appt.id}:`, err.message);
        }
      }
    } catch (err) {
      logger.error('Error en job recordatorios 1h:', err);
    }
  });

  logger.info('Cron recordatorios 1h activo');
};

/**
 * Job para marcar citas como no_show si ya pasó la hora.
 * Corre cada 30 minutos.
 */
const scheduleNoShowCheck = () => {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const now = new Date();
      const cutoffDate = now.toISOString().split('T')[0];
      const cutoffTime = now.toTimeString().substring(0, 8);

      await Appointment.update(
        { status: 'no_show' },
        {
          where: {
            status: { [Op.in]: ['confirmed', 'paid'] },
            [Op.or]: [
              { appointment_date: { [Op.lt]: cutoffDate } },
              {
                appointment_date: cutoffDate,
                end_time: { [Op.lt]: cutoffTime },
              },
            ],
          },
        }
      );
    } catch (err) {
      logger.error('Error en job no_show:', err);
    }
  });

  logger.info('Cron no_show check activo');
};

/**
 * Inicia todos los cron jobs de recordatorios.
 */
const startReminderJobs = () => {
  schedule24hReminders();
  schedule1hReminders();
  scheduleNoShowCheck();
  logger.info('Todos los cron jobs de recordatorios iniciados');
};

module.exports = { startReminderJobs };
