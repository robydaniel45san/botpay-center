import { useState, useEffect } from 'react'
import api from '../lib/api'
import { TrendingUp, MessageSquare, CalendarDays, Users } from 'lucide-react'

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color || 'text-slate-800'}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function SimpleBar({ label, value, max, color = 'bg-indigo-500' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 text-slate-600 truncate shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-slate-500 font-medium">{value}</span>
    </div>
  )
}

export default function Reports() {
  const [range, setRange] = useState('7d')
  const [payments, setPayments] = useState(null)
  const [convs, setConvs] = useState(null)
  const [appts, setAppts] = useState(null)
  const [agents, setAgents] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [p, c, a, ag] = await Promise.all([
          api.get('/crm/reports/payments', { params: { range } }),
          api.get('/crm/reports/conversations', { params: { range } }),
          api.get('/crm/reports/appointments', { params: { range } }),
          api.get('/crm/reports/agents', { params: { range } }),
        ])
        setPayments(p.data)
        setConvs(c.data)
        setAppts(a.data)
        setAgents(ag.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [range])

  const ranges = [
    { value: '7d', label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: '90d', label: '90 días' },
  ]

  return (
    <div className="p-6 h-screen overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-slate-800">Reportes</h1>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button key={r.value} onClick={() => setRange(r.value)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
                ${range === r.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-slate-200 text-slate-600 hover:border-indigo-300 bg-white'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-20">Cargando...</div>
      ) : (
        <div className="flex flex-col gap-6">

          {/* Pagos */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-indigo-500" />
              <h2 className="font-semibold text-slate-700">Cobros</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label="Total cobrado" value={`BOB ${parseFloat(payments?.total_amount || 0).toFixed(2)}`} color="text-emerald-600" />
              <StatCard label="Pagos completados" value={payments?.paid_count} sub={`de ${payments?.total_count} totales`} />
              <StatCard label="Tasa de cobro" value={`${payments?.conversion_rate || 0}%`} color="text-indigo-600" />
              <StatCard label="Ticket promedio" value={`BOB ${parseFloat(payments?.avg_amount || 0).toFixed(2)}`} />
            </div>
            {payments?.by_bank?.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Por banco</p>
                <div className="flex flex-col gap-2">
                  {payments.by_bank.map((b) => (
                    <SimpleBar key={b.bank_code} label={b.bank_code?.toUpperCase()} value={b.count}
                      max={payments.paid_count} color="bg-emerald-400" />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Conversaciones */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={16} className="text-blue-500" />
              <h2 className="font-semibold text-slate-700">Conversaciones</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label="Total" value={convs?.total} />
              <StatCard label="Resueltas" value={convs?.resolved} color="text-emerald-600" />
              <StatCard label="En bot" value={convs?.bot} color="text-blue-600" />
              <StatCard label="Tiempo promedio" value={convs?.avg_resolution_minutes ? `${convs.avg_resolution_minutes} min` : '—'} />
            </div>
          </section>

          {/* Citas */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays size={16} className="text-violet-500" />
              <h2 className="font-semibold text-slate-700">Citas</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label="Total agendadas" value={appts?.total} />
              <StatCard label="Completadas" value={appts?.completed} color="text-emerald-600" />
              <StatCard label="Canceladas" value={appts?.cancelled} color="text-red-500" />
              <StatCard label="No asistió" value={appts?.no_show} color="text-orange-500" />
            </div>
            {appts?.by_service?.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Por servicio</p>
                <div className="flex flex-col gap-2">
                  {appts.by_service.map((s) => (
                    <SimpleBar key={s.name} label={s.name} value={s.count}
                      max={appts.total} color="bg-violet-400" />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Agentes */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-slate-500" />
              <h2 className="font-semibold text-slate-700">Agentes</h2>
            </div>
            {agents?.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Agente', 'Conversaciones', 'Resueltas', 'Mensajes enviados', 'Tiempo prom.'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{a.name}</td>
                        <td className="px-4 py-3 text-slate-600">{a.conversations}</td>
                        <td className="px-4 py-3 text-slate-600">{a.resolved}</td>
                        <td className="px-4 py-3 text-slate-600">{a.messages_sent}</td>
                        <td className="px-4 py-3 text-slate-600">{a.avg_resolution_minutes ? `${a.avg_resolution_minutes} min` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Sin datos</p>
            )}
          </section>

        </div>
      )}
    </div>
  )
}
