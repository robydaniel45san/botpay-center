/**
 * utility.mock.js — Simulación de empresas de servicios públicos
 *
 * Datos de clientes y facturas para 2026.
 * En producción: este módulo sería reemplazado por llamadas HTTP
 * hacia la API real de cada empresa de servicios.
 */

// ── Compañías disponibles por tipo de servicio ────────────────────────────────
const COMPANIES_BY_SERVICE = {
  agua: [
    { id: 'SAGUAPAC', name: 'SAGUAPAC', logo: '💧', description: 'Servicio Municipal de Agua — Cochabamba' },
    { id: 'SEMAPA',   name: 'SEMAPA',   logo: '💧', description: 'Servicio Municipal de Agua — Tarija'    },
    { id: 'COOPAPAS', name: 'COOPAPAS', logo: '💧', description: 'Cooperativa de Agua — La Paz'           },
  ],
  electricidad: [
    { id: 'ELFEC',   name: 'ELFEC',   logo: '⚡', description: 'Empresa de Luz y Fuerza — Cochabamba' },
    { id: 'CRE',     name: 'CRE',     logo: '⚡', description: 'Cooperativa Rural Eléctrica — Sta. Cruz' },
    { id: 'DELAPAZ', name: 'DELAPAZ', logo: '⚡', description: 'Distribución Eléctrica — La Paz'       },
  ],
  internet: [
    { id: 'ENTEL', name: 'ENTEL', logo: '📡', description: 'Empresa Nac. de Telecomunicaciones' },
    { id: 'TIGO',  name: 'TIGO',  logo: '📡', description: 'Tigo Internet y Telefonía'          },
    { id: 'VIVA',  name: 'VIVA',  logo: '📡', description: 'Viva Internet y Telefonía'          },
  ],
};

// ── Metadatos de compañías ────────────────────────────────────────────────────
const COMPANY_META = {
  SAGUAPAC: { idLabel: 'número de medidor',  idExample: 'ej: 12345'    },
  SEMAPA:   { idLabel: 'número de cuenta',   idExample: 'ej: 54321'    },
  COOPAPAS: { idLabel: 'número de socio',    idExample: 'ej: SOC-100'  },
  ELFEC:    { idLabel: 'número de cuenta',   idExample: 'ej: A12345'   },
  CRE:      { idLabel: 'número de socio',    idExample: 'ej: CRE-9900' },
  DELAPAZ:  { idLabel: 'número de medidor',  idExample: 'ej: M-44200'  },
  ENTEL:    { idLabel: 'número de contrato', idExample: 'ej: CT-78901' },
  TIGO:     { idLabel: 'número de línea',    idExample: 'ej: 71234567' },
  VIVA:     { idLabel: 'número de línea',    idExample: 'ej: 78123456' },
};

// ── Base de clientes mock ─────────────────────────────────────────────────────
// Clave: "COMPANY_ID:CUSTOMER_ID"  |  Facturas: de más antigua a más reciente
const CUSTOMERS = {

  // ── SAGUAPAC ─────────────────────────────────────────────────────────
  'SAGUAPAC:12345': {
    name:    'Juan Mamani Quispe',
    address: 'Av. Blanco Galindo Km 3, Zona Norte — Cochabamba',
    invoices: [
      { id: 'SAG-2026-01', period: 'Enero 2026',   amount: 43.50, due: '31/01/2026' },
      { id: 'SAG-2026-02', period: 'Febrero 2026', amount: 51.00, due: '28/02/2026' },
      { id: 'SAG-2026-03', period: 'Marzo 2026',   amount: 45.50, due: '31/03/2026' },
      { id: 'SAG-2026-04', period: 'Abril 2026',   amount: 52.00, due: '30/04/2026' },
      { id: 'SAG-2026-05', period: 'Mayo 2026',    amount: 48.75, due: '31/05/2026' },
    ],
  },
  'SAGUAPAC:67890': {
    name:    'María Flores Condori',
    address: 'Calle Sucre #234, Zona Central — Cochabamba',
    invoices: [
      { id: 'SAG-2026-01', period: 'Enero 2026',   amount: 38.00, due: '31/01/2026' },
      { id: 'SAG-2026-02', period: 'Febrero 2026', amount: 41.50, due: '28/02/2026' },
      { id: 'SAG-2026-03', period: 'Marzo 2026',   amount: 39.00, due: '31/03/2026' },
    ],
  },
  'SAGUAPAC:99001': {
    name:    'Carlos Quispe Torrez',
    address: 'Barrio Minero, Villa Pagador — Cochabamba',
    invoices: [
      { id: 'SAG-2026-02', period: 'Febrero 2026', amount: 35.25, due: '28/02/2026' },
      { id: 'SAG-2026-03', period: 'Marzo 2026',   amount: 37.00, due: '31/03/2026' },
      { id: 'SAG-2026-04', period: 'Abril 2026',   amount: 39.50, due: '30/04/2026' },
    ],
  },
  'SAGUAPAC:55432': {
    name:    'Ana Condori Mamani',
    address: 'Calle 25 de Mayo #89, Quillacollo — Cochabamba',
    invoices: [], // Al día
  },
  'SAGUAPAC:33100': {
    name:    'Pedro Torrez Mamani',
    address: 'Av. Oquendo #56, Zona Sur — Cochabamba',
    invoices: [
      { id: 'SAG-2026-01', period: 'Enero 2026', amount: 29.00, due: '31/01/2026' },
    ],
  },

  // ── ELFEC ─────────────────────────────────────────────────────────────
  'ELFEC:A12345': {
    name:    'Roberto Chávez Durán',
    address: 'Av. América #567, Zona Sur — Cochabamba',
    invoices: [
      { id: 'ELF-2026-01', period: 'Enero 2026',   amount: 120.00, due: '31/01/2026' },
      { id: 'ELF-2026-02', period: 'Febrero 2026', amount:  98.50, due: '28/02/2026' },
      { id: 'ELF-2026-03', period: 'Marzo 2026',   amount: 113.75, due: '31/03/2026' },
    ],
  },
  'ELFEC:B98765': {
    name:    'Lucía Mendoza Vargas',
    address: 'Av. Heroínas #123, Zona Central — Cochabamba',
    invoices: [
      { id: 'ELF-2026-02', period: 'Febrero 2026', amount: 87.00, due: '28/02/2026' },
      { id: 'ELF-2026-03', period: 'Marzo 2026',   amount: 92.50, due: '31/03/2026' },
    ],
  },

  // ── ENTEL ─────────────────────────────────────────────────────────────
  'ENTEL:CT-78901': {
    name:    'Elena Vásquez Suárez',
    address: 'Calle Jordán #456, Zona Norte — Cochabamba',
    invoices: [
      { id: 'ENT-2026-01', period: 'Enero 2026',   amount: 189.00, due: '31/01/2026' },
      { id: 'ENT-2026-02', period: 'Febrero 2026', amount: 189.00, due: '28/02/2026' },
      { id: 'ENT-2026-03', period: 'Marzo 2026',   amount: 199.00, due: '31/03/2026' },
    ],
  },
};

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Lista de compañías disponibles para un tipo de servicio.
 */
const getCompaniesByService = (serviceType) =>
  COMPANIES_BY_SERVICE[serviceType] || [];

/**
 * Metadatos de una compañía (label del ID, ejemplo).
 */
const getCompanyMeta = (companyId) =>
  COMPANY_META[companyId] || { idLabel: 'número de cliente', idExample: 'ej: 12345' };

/**
 * Busca un cliente por compañía y número de contrato/medidor.
 * @returns {{ name, address, customerId, companyId, invoices } | null}
 */
const findCustomer = (companyId, customerId) => {
  const key      = `${companyId}:${customerId.trim()}`;
  const customer = CUSTOMERS[key];
  if (!customer) return null;
  return {
    ...customer,
    customerId:  customerId.trim(),
    companyId,
    invoices: [...customer.invoices], // ya ordenadas: más antigua → más reciente
  };
};

/**
 * Marca facturas como pagadas (elimina del mock).
 * En producción: POST a la API de la empresa para confirmar el pago.
 */
const markInvoicesPaid = (companyId, customerId, invoiceIds) => {
  const key = `${companyId}:${customerId}`;
  if (!CUSTOMERS[key]) return;
  CUSTOMERS[key].invoices = CUSTOMERS[key].invoices.filter(
    (inv) => !invoiceIds.includes(inv.id)
  );
};

module.exports = { getCompaniesByService, getCompanyMeta, findCustomer, markInvoicesPaid };
