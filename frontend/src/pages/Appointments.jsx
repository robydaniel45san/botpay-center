import { useState, useEffect } from 'react'
import api from '../lib/api'
import { CalendarDays, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

const STATUS_MAP = {
  pending:         { label: 'Pendiente',   cls: 'bg-yellow-100 text-yellow-700' },
  confirmed:       { label: 'Confirmada',  cls: 'bg-green-100 text-green-700' },
  pending_payment: { label: 'Pend. pago',  cls: 'bg-blue-100 text-blue-700' },
  paid:            { label: 'Pagada',      cls: 'bg-emerald-100 text-emerald-700' },
  completed:       { label: 'Completada',  cls: 'bg-slate-100 text-slate-600' },
  cancelled:       { label: 'Cancelada',   cls: 'bg-red-100 text-red-700' },
  no_show:         { label: 'No asistió',  cls: 'bg-orange-100 text-orange-700' },
}

export default function Appointments() {
  const [appointments, setAppointments] = useState([])
  const [meta, setMeta]     = useState({})
  const [filters, setFilters] = useState({ from: '', to: '', status: '' })
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const params = { page, limit: 30, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) }
    try {
      const res = await api.get('/crm/appointments', { params })
      setAppointments(res.data)
      setMeta(res.meta)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filters, page])

  const updateStatus = async (id, status) => {
    await api.patch(`/crm/appointments/${id}`, { status })
    load()
  }

  const cancel = async (id) => {
    if (!confirm('¿Cancelar esta cita?')) return
    await api.delete(`/crm/appointments/${id}`)
    load()
  }

  return (
    <div className="p-6 h-screen overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-slate-800">Citas</h1>
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
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Contacto', 'Servicio', 'Fecha', 'Hora', 'Estado', 'Acciones'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Cargando...</td></tr>
            ) : appointments.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Sin citas</td></tr>
            ) : appointments.map((a) => {
              const s = STATUS_MAP[a.status] || { label: a.status, cls: 'bg-slate-100 text-slate-500' }
              return (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{a.contact?.name || a.contact?.phone}</p>
                    <p className="text-xs text-slate-400">{a.contact?.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.service?.emoji} {a.service?.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.appointment_date}</td>
                  <td className="px-4 py-3 text-slate-600">{a.start_time?.substring(0,5)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {a.status === 'pending' && (
                        <button onClick={() => updateStatus(a.id, 'confirmed')}
                          className="text-green-600 hover:text-green-700" title="Confirmar">
                          <CheckCircle size={16} />
                        </button>
                      )}
                      {['pending','confirmed','pending_payment','paid'].includes(a.status) && (
                        <button onClick={() => cancel(a.id)}
                          className="text-red-400 hover:text-red-600" title="Cancelar">
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
