import { useState, useEffect } from 'react'
import api from '../lib/api'
import { Plus, Trash2, Edit2, Check, X, Clock, Tag, Briefcase, Users } from 'lucide-react'

const TABS = [
  { id: 'services', label: 'Productos/Servicios', icon: Briefcase },
  { id: 'schedule', label: 'Horarios', icon: Clock },
  { id: 'agents', label: 'Agentes', icon: Users },
  { id: 'tags', label: 'Etiquetas', icon: Tag },
]

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/* ──────────────────────────── SERVICES ──────────────────────────── */
function ServicesTab() {
  const [services, setServices] = useState([])
  const [form, setForm] = useState(null) // null = hidden, {} = new, {id,...} = edit

  useEffect(() => { loadServices() }, [])

  const loadServices = async () => {
    const res = await api.get('/crm/services')
    setServices(res.data || [])
  }

  const openNew = () => setForm({ name: '', category: '', price: '', emoji: '🛍️', requires_advance_payment: false, advance_payment_amount: '', sort_order: 0 })
  const openEdit = (s) => setForm({ ...s })

  const save = async () => {
    const body = {
      name: form.name,
      category: form.category || null,
      price: form.price !== '' ? Number(form.price) : null,
      emoji: form.emoji,
      requires_advance_payment: form.requires_advance_payment,
      advance_payment_amount: form.requires_advance_payment ? Number(form.advance_payment_amount) : null,
      sort_order: Number(form.sort_order) || 0,
    }
    if (form.id) await api.put(`/crm/services/${form.id}`, body)
    else await api.post('/crm/services', body)
    setForm(null)
    loadServices()
  }

  const remove = async (id) => {
    if (!confirm('¿Eliminar servicio?')) return
    await api.delete(`/crm/services/${id}`)
    loadServices()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-slate-500">Servicios ofrecidos por el negocio</p>
        <button onClick={openNew}
          className="flex items-center gap-1 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors">
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {form && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Emoji</label>
              <input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Nombre *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Categoría</label>
              <input value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="ej: Ropa, Calzado, General"
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Precio BOB <span className="text-slate-400">(vacío = monto libre)</span></label>
              <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="ej: 250"
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Orden en menú</label>
              <input type="number" value={form.sort_order || 0} onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={form.requires_advance_payment}
              onChange={(e) => setForm({ ...form, requires_advance_payment: e.target.checked })} />
            Requiere pago anticipado
          </label>
          {form.requires_advance_payment && (
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Monto anticipado (BOB)</label>
              <input type="number" value={form.advance_payment_amount} onChange={(e) => setForm({ ...form, advance_payment_amount: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setForm(null)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">Cancelar</button>
            <button onClick={save} className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors">Guardar</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['', 'Producto / Servicio', 'Categoría', 'Precio', 'Pago ant.', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.length === 0
              ? <tr><td colSpan={6} className="text-center py-8 text-slate-400">Sin servicios</td></tr>
              : services.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-lg">{s.emoji}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{s.category || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{s.price ? `BOB ${parseFloat(s.price).toFixed(2)}` : <span className="text-xs text-slate-400">Libre</span>}</td>
                  <td className="px-4 py-3">
                    {s.requires_advance_payment
                      ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">BOB {parseFloat(s.advance_payment_amount).toFixed(2)}</span>
                      : <span className="text-xs text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(s)} className="text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={14} /></button>
                      <button onClick={() => remove(s.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ──────────────────────────── SCHEDULE ──────────────────────────── */
function ScheduleTab() {
  const [schedule, setSchedule] = useState([])
  const [blocks, setBlocks] = useState([])
  const [blockForm, setBlockForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadSchedule(); loadBlocks() }, [])

  const loadSchedule = async () => {
    const res = await api.get('/crm/schedule')
    setSchedule(res.data || [])
  }

  const loadBlocks = async () => {
    const res = await api.get('/crm/schedule/blocks')
    setBlocks(res.data || [])
  }

  const toggle = (idx) => {
    const updated = [...schedule]
    updated[idx] = { ...updated[idx], is_open: !updated[idx].is_open }
    setSchedule(updated)
  }

  const updateTime = (idx, field, val) => {
    const updated = [...schedule]
    updated[idx] = { ...updated[idx], [field]: val }
    setSchedule(updated)
  }

  const saveSchedule = async () => {
    setSaving(true)
    try {
      await api.put('/crm/schedule', { schedule })
    } finally { setSaving(false) }
  }

  const addBlock = async () => {
    await api.post('/crm/schedule/blocks', blockForm)
    setBlockForm(null)
    loadBlocks()
  }

  const removeBlock = async (id) => {
    await api.delete(`/crm/schedule/blocks/${id}`)
    loadBlocks()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Horario semanal */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 mb-3">Horario semanal</p>
        <div className="flex flex-col gap-2">
          {schedule.map((day, idx) => (
            <div key={day.day_of_week} className="flex items-center gap-3">
              <button onClick={() => toggle(idx)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0
                  ${day.is_open ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                {day.is_open && <Check size={10} className="text-white" />}
              </button>
              <span className="w-24 text-sm text-slate-700">{DAYS[day.day_of_week]}</span>
              {day.is_open ? (
                <>
                  <input type="time" value={day.open_time || '09:00'} onChange={(e) => updateTime(idx, 'open_time', e.target.value)}
                    className="border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400" />
                  <span className="text-slate-400 text-xs">a</span>
                  <input type="time" value={day.close_time || '18:00'} onChange={(e) => updateTime(idx, 'close_time', e.target.value)}
                    className="border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400" />
                </>
              ) : (
                <span className="text-xs text-slate-400">Cerrado</span>
              )}
            </div>
          ))}
        </div>
        <button onClick={saveSchedule} disabled={saving}
          className="mt-4 text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar horario'}
        </button>
      </div>

      {/* Bloqueos */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm font-semibold text-slate-700">Bloqueos de agenda</p>
          <button onClick={() => setBlockForm({ date: '', start_time: '', end_time: '', reason: '' })}
            className="flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-200 transition-colors">
            <Plus size={12} /> Agregar
          </button>
        </div>
        {blockForm && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 flex flex-wrap gap-2">
            <input type="date" value={blockForm.date} onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })}
              className="border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400" />
            <input type="time" value={blockForm.start_time} onChange={(e) => setBlockForm({ ...blockForm, start_time: e.target.value })}
              className="border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400" />
            <input type="time" value={blockForm.end_time} onChange={(e) => setBlockForm({ ...blockForm, end_time: e.target.value })}
              className="border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400" />
            <input placeholder="Motivo" value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
              className="border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400 flex-1" />
            <button onClick={addBlock} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-500 transition-colors">Agregar</button>
            <button onClick={() => setBlockForm(null)} className="text-xs text-slate-500 px-2 py-1"><X size={12} /></button>
          </div>
        )}
        {blocks.length === 0
          ? <p className="text-xs text-slate-400">Sin bloqueos</p>
          : blocks.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
              <div>
                <span className="text-sm font-medium text-slate-700">{b.date}</span>
                <span className="text-xs text-slate-400 ml-2">{b.start_time?.substring(0,5)} – {b.end_time?.substring(0,5)}</span>
                {b.reason && <span className="text-xs text-slate-400 ml-2">· {b.reason}</span>}
              </div>
              <button onClick={() => removeBlock(b.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
            </div>
          ))
        }
      </div>
    </div>
  )
}

/* ──────────────────────────── AGENTS ──────────────────────────── */
function AgentsTab() {
  const [agents, setAgents] = useState([])
  const [form, setForm] = useState(null)

  useEffect(() => { loadAgents() }, [])

  const loadAgents = async () => {
    const res = await api.get('/crm/agents')
    setAgents(res.data || [])
  }

  const openNew = () => setForm({ name: '', email: '', password: '', role: 'agent', max_conversations: 5 })

  const save = async () => {
    if (form.id) {
      const body = { name: form.name, role: form.role, max_conversations: Number(form.max_conversations) }
      await api.put(`/crm/agents/${form.id}`, body)
    } else {
      await api.post('/crm/agents', { ...form, max_conversations: Number(form.max_conversations) })
    }
    setForm(null)
    loadAgents()
  }

  const remove = async (id) => {
    if (!confirm('¿Eliminar agente?')) return
    await api.delete(`/crm/agents/${id}`)
    loadAgents()
  }

  const ROLE_LABEL = { admin: 'Admin', supervisor: 'Supervisor', agent: 'Agente' }
  const ROLE_COLOR = { admin: 'bg-red-100 text-red-700', supervisor: 'bg-blue-100 text-blue-700', agent: 'bg-slate-100 text-slate-600' }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-slate-500">Operadores del CRM</p>
        <button onClick={openNew}
          className="flex items-center gap-1 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors">
          <Plus size={14} /> Nuevo agente
        </button>
      </div>

      {form && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Nombre</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            {!form.id && (
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Contraseña</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Rol</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400">
                <option value="agent">Agente</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Máx. conversaciones</label>
              <input type="number" value={form.max_conversations} onChange={(e) => setForm({ ...form, max_conversations: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setForm(null)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">Cancelar</button>
            <button onClick={save} className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors">Guardar</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Nombre', 'Email', 'Rol', 'Máx. conv.', 'Estado', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.length === 0
              ? <tr><td colSpan={6} className="text-center py-8 text-slate-400">Sin agentes</td></tr>
              : agents.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{a.name}</td>
                  <td className="px-4 py-3 text-slate-600">{a.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[a.role]}`}>
                      {ROLE_LABEL[a.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.max_conversations}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.is_online ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                      {a.is_online ? 'En línea' : 'Fuera'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => setForm({ ...a })} className="text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={14} /></button>
                      <button onClick={() => remove(a.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ──────────────────────────── TAGS ──────────────────────────── */
const TAG_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#64748b']

function TagsTab() {
  const [tags, setTags] = useState([])
  const [form, setForm] = useState(null)

  useEffect(() => { loadTags() }, [])

  const loadTags = async () => {
    const res = await api.get('/crm/tags')
    setTags(res.data || [])
  }

  const save = async () => {
    if (form.id) await api.put(`/crm/tags/${form.id}`, { name: form.name, color: form.color })
    else await api.post('/crm/tags', { name: form.name, color: form.color })
    setForm(null)
    loadTags()
  }

  const remove = async (id) => {
    if (!confirm('¿Eliminar etiqueta?')) return
    await api.delete(`/crm/tags/${id}`)
    loadTags()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-slate-500">Etiquetas para clasificar contactos</p>
        <button onClick={() => setForm({ name: '', color: TAG_COLORS[0] })}
          className="flex items-center gap-1 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors">
          <Plus size={14} /> Nueva
        </button>
      </div>

      {form && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600 mb-1 block">Nombre</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Color</label>
            <div className="flex gap-1">
              {TAG_COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${form.color === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <button onClick={save} className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors">Guardar</button>
          <button onClick={() => setForm(null)} className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tags.length === 0
          ? <p className="text-sm text-slate-400">Sin etiquetas</p>
          : tags.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-medium" style={{ backgroundColor: t.color }}>
              {t.name}
              <button onClick={() => setForm({ ...t })} className="opacity-70 hover:opacity-100 transition-opacity"><Edit2 size={11} /></button>
              <button onClick={() => remove(t.id)} className="opacity-70 hover:opacity-100 transition-opacity"><X size={11} /></button>
            </div>
          ))
        }
      </div>
    </div>
  )
}

/* ──────────────────────────── MAIN ──────────────────────────── */
export default function Settings() {
  const [tab, setTab] = useState('services')

  return (
    <div className="p-6 h-screen overflow-y-auto">
      <h1 className="text-xl font-bold text-slate-800 mb-5">Configuración</h1>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab === id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'services' && <ServicesTab />}
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'agents' && <AgentsTab />}
      {tab === 'tags' && <TagsTab />}
    </div>
  )
}
