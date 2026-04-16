import { useState, useEffect } from 'react'
import api from '../lib/api'
import { Search, Plus, Tag, Phone, Mail, ChevronRight } from 'lucide-react'

const STATUS_BADGE = {
  active:      'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-red-700',
  unsubscribed:'bg-slate-100 text-slate-500',
}

export default function Contacts() {
  const [contacts, setContacts] = useState([])
  const [meta, setMeta]         = useState({})
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail]     = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/crm/contacts', { params: { search, page, limit: 20 } })
      setContacts(res.data)
      setMeta(res.meta)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [search, page])

  const openDetail = async (c) => {
    setSelected(c)
    const [contact, payments, appointments] = await Promise.all([
      api.get(`/crm/contacts/${c.id}`),
      api.get(`/crm/contacts/${c.id}/payments`),
      api.get(`/crm/contacts/${c.id}/appointments`),
    ])
    setDetail({ contact: contact.data, payments: payments.data, appointments: appointments.data })
  }

  return (
    <div className="flex h-screen">
      {/* Lista */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-800">Contactos</h1>
        </div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por nombre, teléfono o email..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 bg-white"
          />
        </div>
        <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200">
          {loading ? (
            <p className="text-center text-slate-400 py-12">Cargando...</p>
          ) : contacts.length === 0 ? (
            <p className="text-center text-slate-400 py-12">Sin resultados</p>
          ) : contacts.map((c) => (
            <button key={c.id} onClick={() => openDetail(c)}
              className={`w-full flex items-center gap-3 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors text-left
                ${selected?.id === c.id ? 'bg-indigo-50' : ''}`}>
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                {c.name?.charAt(0)?.toUpperCase() ?? c.phone?.slice(-2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{c.name || c.phone}</p>
                <p className="text-xs text-slate-400">{c.phone}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[c.status]}`}>
                {c.status}
              </span>
              <ChevronRight size={14} className="text-slate-300" />
            </button>
          ))}
        </div>
        {/* Paginación */}
        {meta.pages > 1 && (
          <div className="flex justify-center gap-2 mt-3">
            {Array.from({ length: meta.pages }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors
                  ${p === page ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detalle */}
      {detail && (
        <div className="w-80 border-l border-slate-200 p-4 overflow-y-auto bg-white flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg">
              {detail.contact.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="font-bold text-slate-800">{detail.contact.name || 'Sin nombre'}</p>
              <p className="text-sm text-slate-500">{detail.contact.phone}</p>
            </div>
          </div>
          {detail.contact.email && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Mail size={13} className="text-slate-400" /> {detail.contact.email}
            </div>
          )}
          {detail.contact.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {detail.contact.tags.map((t) => (
                <span key={t.id} className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                  style={{ backgroundColor: t.color }}>{t.name}</span>
              ))}
            </div>
          )}
          {/* Últimos pagos */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Últimos cobros</p>
            {detail.payments.length === 0
              ? <p className="text-xs text-slate-400">Sin cobros</p>
              : detail.payments.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                    <span className="text-xs text-slate-600">BOB {parseFloat(p.amount).toFixed(2)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full
                      ${p.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.status}
                    </span>
                  </div>
                ))
            }
          </div>
          {/* Próximas citas */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Citas</p>
            {detail.appointments.length === 0
              ? <p className="text-xs text-slate-400">Sin citas</p>
              : detail.appointments.slice(0, 3).map((a) => (
                  <div key={a.id} className="py-1.5 border-b border-slate-100 last:border-0">
                    <p className="text-xs font-medium text-slate-700">{a.service?.name}</p>
                    <p className="text-[11px] text-slate-400">{a.appointment_date} · {a.start_time?.substring(0,5)}</p>
                  </div>
                ))
            }
          </div>
        </div>
      )}
    </div>
  )
}
