const axios = require('axios');
const metaConfig = require('../../config/meta');
const logger = require('../../config/logger');

class WhatsAppService {
  constructor() {
    this.client = axios.create({
      baseURL: `${metaConfig.apiBaseUrl}/${metaConfig.phoneNumberId}/messages`,
      headers: {
        Authorization: `Bearer ${metaConfig.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // ── Método base de envío ─────────────────────────────
  async send(payload) {
    try {
      const response = await this.client.post('', {
        messaging_product: 'whatsapp',
        ...payload,
      });
      logger.info(`WA enviado a ${payload.to} tipo=${payload.type || 'text'}`);
      return response.data;
    } catch (err) {
      const detail = err.response?.data || err.message;
      logger.error('Error enviando mensaje WhatsApp:', detail);
      throw err;
    }
  }

  // ── Texto simple ─────────────────────────────────────
  async sendText(to, text, previewUrl = false) {
    return this.send({
      to,
      type: 'text',
      text: { body: text, preview_url: previewUrl },
    });
  }

  // ── Imagen ───────────────────────────────────────────
  async sendImage(to, { url, caption } = {}) {
    return this.send({
      to,
      type: 'image',
      image: { link: url, caption },
    });
  }

  // ── Imagen por media_id (subida a Meta) ──────────────
  async sendImageById(to, mediaId, caption = '') {
    return this.send({
      to,
      type: 'image',
      image: { id: mediaId, caption },
    });
  }

  // ── Documento ────────────────────────────────────────
  async sendDocument(to, { url, filename, caption } = {}) {
    return this.send({
      to,
      type: 'document',
      document: { link: url, filename, caption },
    });
  }

  // ── Mensaje interactivo con botones ──────────────────
  // buttons: [{ id: 'btn_1', title: 'Opción 1' }, ...]  (máx 3)
  async sendButtons(to, { body, footer, buttons, header } = {}) {
    const payload = {
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    };

    if (header) payload.interactive.header = { type: 'text', text: header };
    if (footer) payload.interactive.footer = { text: footer };

    return this.send(payload);
  }

  // ── Lista interactiva ────────────────────────────────
  // sections: [{ title: 'Sección', rows: [{ id, title, description }] }]
  async sendList(to, { body, footer, buttonText, sections, header } = {}) {
    const payload = {
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button: buttonText || 'Ver opciones',
          sections,
        },
      },
    };

    if (header) payload.interactive.header = { type: 'text', text: header };
    if (footer) payload.interactive.footer = { text: footer };

    return this.send(payload);
  }

  // ── Template aprobado por Meta ───────────────────────
  // components: parámetros del template (header, body, buttons)
  async sendTemplate(to, { templateName, languageCode = 'es', components = [] } = {}) {
    return this.send({
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    });
  }

  // ── Marcar mensaje como leído ────────────────────────
  async markAsRead(waMessageId) {
    try {
      await this.client.post('', {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: waMessageId,
      });
    } catch (err) {
      logger.warn(`No se pudo marcar como leído: ${waMessageId}`);
    }
  }

  // ── Subir media a Meta y obtener media_id ────────────
  async uploadMedia(fileBuffer, mimeType, filename) {
    const FormData = require('form_data'); // opcional si se usa
    const form = new FormData();
    form.append('file', fileBuffer, { contentType: mimeType, filename });
    form.append('type', mimeType);
    form.append('messaging_product', 'whatsapp');

    const response = await axios.post(
      `${metaConfig.apiBaseUrl}/${metaConfig.phoneNumberId}/media`,
      form,
      {
        headers: {
          Authorization: `Bearer ${metaConfig.accessToken}`,
          ...form.getHeaders(),
        },
      }
    );
    return response.data.id;
  }

  // ── Obtener URL de un media_id ───────────────────────
  async getMediaUrl(mediaId) {
    const response = await axios.get(`${metaConfig.apiBaseUrl}/${mediaId}`, {
      headers: { Authorization: `Bearer ${metaConfig.accessToken}` },
    });
    return response.data.url;
  }

  // ── Descargar media (requiere el URL obtenido de Meta) ─
  async downloadMedia(mediaUrl) {
    const response = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${metaConfig.accessToken}` },
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }
}

module.exports = new WhatsAppService();
