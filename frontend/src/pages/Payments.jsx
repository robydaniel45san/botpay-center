import { useState, useEffect } from 'react'
import api from '../lib/api'
import { RefreshCw } from 'lucide-react'

const STATUS_BADGE = {
  pending:      'bg-yellow-100 text-yellow-700',
  qr_generated: 'bg-blue-100 text-blue-700',
  paid:         'bg-green-100 text-green-700',
  expired:      'bg-slate-100 text-slate-500',
  cancelled:    'bg-red-100 text-red-700',
  error:        'bg-orange-100 text-orange-700',
}
const STATUS_LABEL = {
  pending: 'Pendiente', qr_generated: 'QR enviado', paid: 'Pagado',
  expired: 'Vencido', cancelled: 'Cancelado', error: 'Error',
}
const BANK_LABEL = { bmsc: 'BMSC', bnb: 'BNB', bisa: 'BISA' }

export default function Payments() {
  const [payments, setPayments]   = useState([])
  const [meta, setMeta]           = useState({})
  const [filters, setFilters]     = useState({ from: '', to: '', status: '', bank: '' })
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(null)

  const load = async () => {
    setLoading(true)
    const params = { page, limit: 25, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) }
    try {
      const res = await api.get('/crm/payments', { params })
      setPayments(res.data)
      setMeta(res.meta)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filters, page])

  const syncStatus = async (id) => {
    setSyncing(id)
    try {
      await api.post(`/crm/payments/${id}/sync`)
      load()
    } finally { setSyncing(null) }
  }

  return (
    <div className="p-6 h-screen overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-slate-800">Pagos</h1>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-indigo-400" />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-indigo-400" />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-indigo-400">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.bank} onChange={(e) => setFilters({ ...filters, bank: e.target.value })}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-indigo-400">
          <option value="">Todos los bancos</option>
          {Object.entries(BANK_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Referencia', 'Contacto', 'Monto', 'Banco', 'Estado', 'Fecha', 'Acciones'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Cargando...</td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Sin pagos</td></tr>
            ) : payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {p.paycenter_order_id || p.id.split('-')[0]}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {p.contact?.name || p.contact?.phone || '—'}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-800">
                  BOB {parseFloat(p.amount).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-slate-600 uppercase text-xs">{p.bank_code}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[p.status]}`}>
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {new Date(p.created_at).toLocaleDateString('es-BO')}
                </td>
                <td className="px-4 py-3">
                  {['qr_generated','pending'].includes(p.status) && (
                    <button onClick={() => syncStatus(p.id)}
                      disabled={syncing === p.id}
                      className="text-slate-400 hover:text-indigo-600 transition-colors" title="Sincronizar con PayCenter">
                      <RefreshCw size={14} className={syncing === p.id ? 'animate-spin' : ''} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
