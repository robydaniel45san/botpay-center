import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../lib/api'
import { getSocket } from '../lib/socket'
import {
  Send, Bot, User, CheckCheck, Search, UserCheck,
  QrCode, X, AlertTriangle, MousePointerClick,
  ChevronDown, RefreshCw
} from 'lucide-react'

// ─── Utilidades ──────────────────────────────────────────────────────────────

const parseContent = (raw) => {
  if (!raw) return { type: 'text', text: '' }
  try {
    const p = JSON.parse(raw)
    if (p && p.title) return { type: 'interactive', id: p.id, title: p.title, description: p.description }
  } catch {}
  return { type: 'text', text: raw }
}

const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : ''

const fmtPreviewTime = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  const today = new Date()
  if (dt.toDateString() === today.toDateString())
    return dt.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  if (dt.toDateString() === yest.toDateString()) return 'Ayer'
  return dt.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' })
}

const dateSepLabel = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  if (dt.toDateString() === today.toDateString()) return 'Hoy'
  if (dt.toDateString() === yest.toDateString()) return 'Ayer'
  return dt.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Construye grupos de mensajes con separadores de fecha
const buildItems = (msgs) => {
  const out = []
  let lastDate = null
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    const ds = m.sent_at ? new Date(m.sent_at).toDateString() : 'x'
    if (ds !== lastDate) {
      out.push({ kind: 'sep', label: dateSepLabel(m.sent_at), key: `sep${i}` })
      lastDate = ds
    }
    const prev = msgs[i - 1]
    const next = msgs[i + 1]
    const sameGroup = (a, b) =>
      a && b &&
      a.direction === b.direction &&
      a.sender_type === b.sender_type &&
      Math.abs(new Date(b.sent_at) - new Date(a.sent_at)) < 180_000
    out.push({
      kind: 'msg', msg: m, key: m.id,
      first: !sameGroup(prev, m),
      last:  !sameGroup(m, next),
    })
  }
  return out
}

const BADGE = {
  bot:      'bg-sky-100 text-sky-700',
  open:     'bg-emerald-100 text-emerald-700',
  pending:  'bg-amber-100 text-amber-700',
  resolved: 'bg-slate-100 text-slate-500',
}
const BADGE_LABEL = { bot: 'Bot', open: 'Agente', pending: 'Pendiente', resolved: 'Resuelto' }

// ─── Burbuja de mensaje ──────────────────────────────────────────────────────

function Bubble({ msg, first, last }) {
  const out = msg.direction === 'outbound'
  const isBot = msg.sender_type === 'bot'
  const parsed = parseContent(msg.content)
  const qr = msg.metadata?.qr_base64

  // Colores
  const bgOut = isBot ? 'bg-indigo-600' : 'bg-emerald-600'
  const textOut = 'text-white'

  // Forma de la burbuja
  const shapeOut = `rounded-2xl ${first ? 'rounded-tr-md' : ''} ${last ? 'rounded-br-md' : ''}`
  const shapeIn  = `rounded-2xl ${first ? 'rounded-tl-md' : ''} ${last ? 'rounded-bl-md' : ''}`

  return (
    <div className={`flex items-end gap-1.5 ${out ? 'flex-row-reverse' : 'flex-row'}
      ${last ? 'mb-2' : 'mb-0.5'}`}>

      {/* Avatar lateral (solo última burbuja del grupo) */}
      <div className="w-6 shrink-0">
        {last && (
          out
            ? <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px]
                ${isBot ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                {isBot ? <Bot size={12} /> : <User size={12} />}
              </div>
            : <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center">
                <User size={12} className="text-slate-600" />
              </div>
        )}
      </div>

      {/* Burbuja */}
      <div className={`relative max-w-[62%]`}>
        {/* Etiqueta bot/agente (solo primera del grupo, saliente) */}
        {out && first && (
          <p className={`text-[10px] mb-0.5 text-right font-medium
            ${isBot ? 'text-indigo-400' : 'text-emerald-500'}`}>
            {isBot ? 'Bot' : 'Agente'}
          </p>
        )}

        <div className={`px-3 py-2 text-sm shadow-sm break-words leading-relaxed
          ${out ? `${bgOut} ${textOut} ${shapeOut} bubble-out ${last ? 'has-tail' : ''}` : `bg-white text-slate-800 ${shapeIn} bubble-in ${last ? 'has-tail' : ''}`}
        `}>
          {qr && msg.type === 'image' ? (
            <div className="flex flex-col items-center gap-2">
              <img src={qr} alt="QR" className="w-44 h-44 rounded-xl bg-white p-1" />
              {parsed.text && <p className="text-xs opacity-75 text-center">{parsed.text}</p>}
            </div>
          ) : parsed.type === 'interactive' ? (
            <div className="flex items-center gap-2 py-0.5">
              <div className={`p-1 rounded-full shrink-0 ${out ? 'bg-white/20' : 'bg-indigo-50'}`}>
                <MousePointerClick size={11} className={out ? 'text-white' : 'text-indigo-500'} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{parsed.title}</p>
                {parsed.description && (
                  <p className={`text-[11px] truncate ${out ? 'opacity-70' : 'text-slate-400'}`}>
                    {parsed.description}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{parsed.text || `[${msg.type}]`}</p>
          )}

          {/* Hora — solo última del grupo */}
          {last && (
            <div className={`flex items-center gap-1 mt-1 ${out ? 'justify-end' : 'justify-end'}
              ${out ? 'text-white/50' : 'text-slate-300'}`}>
              <span className="text-[10px]">{fmtTime(msg.sent_at)}</span>
              {out && <CheckCheck size={11} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Item en la lista de conversaciones ─────────────────────────────────────

function ConvItem({ conv, active, onClick }) {
  const c = conv.contact
  const initials = c?.name
    ? c.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : c?.phone?.slice(-2) ?? '?'

  const preview = (() => {
    const p = parseContent(conv.last_message_preview || '')
    return p.type === 'interactive' ? `› ${p.title}` : (p.text || '—')
  })()

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-all border-b border-slate-100 text-left
        ${active ? 'bg-indigo-50 border-l-[3px] border-l-indigo-500' : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'}`}
    >
      {/* Avatar */}
      <div className={`w-11 h-11 rounded-full shrink-0 flex items-center justify-center font-bold text-sm
        ${active ? 'bg-indigo-600 text-white' : 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'}`}>
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-0.5">
          <span className={`font-semibold text-sm truncate ${active ? 'text-indigo-700' : 'text-slate-800'}`}>
            {c?.name || c?.phone}
          </span>
          <span className="text-[10px] text-slate-400 shrink-0 ml-2 tabular-nums">
            {fmtPreviewTime(conv.last_message_at)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-slate-400 truncate flex-1">{preview}</p>
          {conv.unread_count > 0 && (
            <span className="bg-indigo-600 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {conv.unread_count > 9 ? '9+' : conv.unread_count}
            </span>
          )}
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${BADGE[conv.status]}`}>
            {BADGE_LABEL[conv.status]}
          </span>
        </div>
      </div>
    </button>
  )
}

// ─── Separador de fecha ──────────────────────────────────────────────────────

function DateSep({ label }) {
  return (
    <div className="flex items-center justify-center my-5 select-none">
      <div className="bg-white/80 backdrop-blur-sm shadow-sm text-slate-500 text-[11px] font-medium px-4 py-1 rounded-full border border-slate-200">
        {label}
      </div>
    </div>
  )
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

export default function Inbox() {
  const [convs, setConvs]         = useState([])
  const [active, setActive]       = useState(null)
  const [msgs, setMsgs]           = useState([])
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingChat, setLoadingChat] = useState(false)
  const [showBottom, setShowBottom]   = useState(false)
  const [qrOpen, setQrOpen]       = useState(false)
  const [qrAmt, setQrAmt]         = useState('')
  const [qrDesc, setQrDesc]       = useState('')
  const [qrBank, setQrBank]       = useState('bmsc')
  const [qrSending, setQrSending] = useState(false)
  const [alerts, setAlerts]       = useState([])

  const msgsEl  = useRef(null)
  const bottomEl = useRef(null)
  const inputEl = useRef(null)

  // ── Cargar conversaciones ────────────────────────────
  const loadConvs = useCallback(async () => {
    try {
      const params = {}
      if (search) params.search = search
      if (filter) params.status = filter
      const r = await api.get('/crm/conversations', { params })
      setConvs(r.data || [])
    } finally {
      setLoadingList(false)
    }
  }, [search, filter])

  useEffect(() => { loadConvs() }, [loadConvs])

  // ── Abrir conversación ───────────────────────────────
  const openConv = async (conv) => {
    setActive(conv)
    setLoadingChat(true)
    setMsgs([])
    try {
      const r = await api.get(`/crm/conversations/${conv.id}`)
      setMsgs(r.data.messages || [])
      getSocket().emit('join_conversation', conv.id)
    } finally {
      setLoadingChat(false)
    }
    setTimeout(() => inputEl.current?.focus(), 80)
  }

  // ── Socket.io ────────────────────────────────────────
  useEffect(() => {
    const sk = getSocket()
    sk.on('new_message', ({ conversationId, message }) => {
      if (active?.id === conversationId) setMsgs(p => [...p, message])
      loadConvs()
    })
    sk.on('inbox_update', loadConvs)
    sk.on('payment_received', ({ conversationId }) => {
      if (active?.id === conversationId) openConv(active)
      loadConvs()
    })
    sk.on('watchdog:alert', (a) => {
      if (a.status === 'down') {
        setAlerts(p => p.find(x => x.service === a.service) ? p : [...p, a])
        setTimeout(() => setAlerts(p => p.filter(x => x.service !== a.service)), 10_000)
      } else {
        setAlerts(p => p.filter(x => x.service !== a.service))
      }
    })
    return () => { sk.off('new_message'); sk.off('inbox_update'); sk.off('payment_received'); sk.off('watchdog:alert') }
  }, [active, loadConvs])

  // ── Auto-scroll ──────────────────────────────────────
  useEffect(() => {
    const el = msgsEl.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (nearBottom) bottomEl.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const handleScroll = () => {
    const el = msgsEl.current
    if (el) setShowBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 300)
  }

  // ── Enviar mensaje ───────────────────────────────────
  const send = async (e) => {
    e.preventDefault()
    if (!text.trim() || !active || sending) return
    setSending(true)
    try {
      const r = await api.post(`/crm/conversations/${active.id}/messages`, { text: text.trim() })
      setMsgs(p => [...p, r.data])
      setText('')
    } finally { setSending(false) }
  }

  const assignToMe = async () => {
    const agent = JSON.parse(localStorage.getItem('bp_agent') || 'null')
    if (!agent || !active) return
    await api.post(`/crm/conversations/${active.id}/assign`, { agentId: agent.id })
    loadConvs(); openConv(active)
  }

  const resumeBot = async () => {
    if (!active) return
    await api.post(`/crm/conversations/${active.id}/bot-resume`)
    loadConvs()
  }

  const sendQR = async (e) => {
    e.preventDefault()
    const amount = parseFloat(qrAmt)
    if (!amount || amount <= 0 || !active) return
    setQrSending(true)
    try {
      await api.post(`/crm/conversations/${active.id}/qr`, {
        amount, description: qrDesc.trim() || 'Cobro CRM', bank: qrBank,
      })
      setQrOpen(false); setQrAmt(''); setQrDesc(''); setQrBank('bmsc')
      openConv(active)
    } finally { setQrSending(false) }
  }

  const items = buildItems(msgs)
  const isBot  = active?.status === 'bot'
  const canWrite = active?.status === 'open'

  return (
    /* Ocupa exactamente el espacio del <main> del Layout */
    <div className="flex h-full overflow-hidden bg-white">

      {/* ══════════════ PANEL IZQUIERDO ══════════════ */}
      <aside className="w-[340px] shrink-0 flex flex-col h-full bg-white border-r border-slate-200">

        {/* Header */}
        <div className="px-4 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-slate-900">Chats</h1>
            <button onClick={loadConvs} title="Actualizar"
              className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              <RefreshCw size={15} />
            </button>
          </div>

          {/* Buscador */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversación..."
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-100 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-slate-400"
            />
          </div>

          {/* Filtros */}
          <div className="flex gap-1.5">
            {[['', 'Todos'], ['bot', 'Bot'], ['open', 'Agente'], ['pending', 'Pendiente'], ['resolved', 'Resuelto']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors whitespace-nowrap
                  ${filter === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Lista — ÚNICA zona scrollable del panel izq */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingList ? (
            <div className="flex justify-center mt-16">
              <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : convs.length === 0 ? (
            <div className="flex flex-col items-center mt-16 text-slate-400">
              <Search size={28} className="mb-2 opacity-40" />
              <p className="text-sm">Sin conversaciones</p>
            </div>
          ) : (
            convs.map(c => (
              <ConvItem key={c.id} conv={c} active={active?.id === c.id} onClick={() => openConv(c)} />
            ))
          )}
        </div>
      </aside>

      {/* ══════════════ PANEL DERECHO ═══════════════ */}
      {active ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden">

          {/* ── Alertas ────────────────────────────────── */}
          {alerts.length > 0 && (
            <div className="flex flex-col gap-1 px-4 pt-2 bg-white">
              {alerts.map(a => (
                <div key={a.service} className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
                  <AlertTriangle size={13} />
                  <span className="flex-1"><b>{a.service}</b> — {a.error || 'Sin respuesta'}</span>
                  <button onClick={() => setAlerts(p => p.filter(x => x.service !== a.service))}><X size={13} /></button>
                </div>
              ))}
            </div>
          )}

          {/* ── Cabecera del chat ─────────────────────── */}
          <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {active.contact?.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm leading-tight">
                  {active.contact?.name || 'Sin nombre'}
                </p>
                <p className="text-xs text-slate-400">{active.contact?.phone}</p>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-2">
              <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${BADGE[active.status]}`}>
                {BADGE_LABEL[active.status]}
              </span>
              {isBot && (
                <button onClick={assignToMe}
                  className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl font-semibold transition-colors">
                  <UserCheck size={13} /> Tomar
                </button>
              )}
              {active.status === 'open' && (
                <button onClick={resumeBot}
                  className="flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl font-semibold transition-colors">
                  <Bot size={13} /> Pasar al bot
                </button>
              )}
              <button onClick={() => setQrOpen(true)}
                className="flex items-center gap-1.5 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-2 rounded-xl font-semibold transition-colors">
                <QrCode size={13} /> QR
              </button>
            </div>
          </div>

          {/* ── Mensajes — ÚNICA zona scrollable del chat ─ */}
          <div className="relative flex-1 min-h-0">
            <div
              ref={msgsEl}
              onScroll={handleScroll}
              className="absolute inset-0 overflow-y-auto px-6 py-4 chat-bg"
            >
              {loadingChat ? (
                <div className="flex justify-center mt-20">
                  <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : msgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <div className="w-16 h-16 rounded-full bg-white/60 flex items-center justify-center mb-3 shadow-sm">
                    <Bot size={28} className="opacity-40" />
                  </div>
                  <p className="text-sm font-medium">Sin mensajes aún</p>
                </div>
              ) : (
                items.map(it =>
                  it.kind === 'sep'
                    ? <DateSep key={it.key} label={it.label} />
                    : <Bubble key={it.key} msg={it.msg} first={it.first} last={it.last} />
                )
              )}
              <div ref={bottomEl} />
            </div>

            {/* Botón volver al fondo */}
            {showBottom && (
              <button
                onClick={() => bottomEl.current?.scrollIntoView({ behavior: 'smooth' })}
                className="absolute bottom-4 right-6 w-9 h-9 bg-white shadow-lg border border-slate-200 rounded-full flex items-center justify-center text-slate-600 hover:text-indigo-600 transition-colors z-10">
                <ChevronDown size={18} />
              </button>
            )}
          </div>

          {/* ── Barra de escritura ────────────────────── */}
          <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-3">
            {isBot && (
              <div className="flex items-center gap-2 mb-2 py-1.5 px-3 bg-sky-50 rounded-xl text-xs text-sky-700">
                <Bot size={13} />
                <span>El bot está atendiendo esta conversación.</span>
                <button onClick={assignToMe}
                  className="ml-auto font-semibold underline hover:no-underline whitespace-nowrap">
                  Tomar ahora
                </button>
              </div>
            )}
            <form onSubmit={send} className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-slate-100 rounded-2xl px-4 py-2.5 gap-2">
                <input
                  ref={inputEl}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={canWrite ? 'Escribe un mensaje...' : 'Toma la conversación para responder'}
                  disabled={!canWrite || sending}
                  className="flex-1 bg-transparent text-sm focus:outline-none disabled:text-slate-400 placeholder:text-slate-400"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) } }}
                />
              </div>
              <button type="submit"
                disabled={!text.trim() || !canWrite || sending}
                className="w-10 h-10 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shrink-0">
                {sending
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Send size={16} />
                }
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Estado vacío */
        <div className="flex-1 flex flex-col items-center justify-center chat-bg text-slate-500">
          <div className="w-24 h-24 rounded-full bg-white/70 shadow-sm flex items-center justify-center mb-4">
            <Bot size={40} className="text-indigo-300" />
          </div>
          <p className="text-base font-semibold text-slate-600">Selecciona un chat</p>
          <p className="text-sm text-slate-400 mt-1">para ver la conversación</p>
        </div>
      )}

      {/* ══════════════ MODAL QR ════════════════════ */}
      {qrOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <QrCode size={18} className="text-emerald-600" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Generar cobro QR</h3>
              </div>
              <button onClick={() => { setQrOpen(false); setQrAmt(''); setQrDesc(''); setQrBank('bmsc') }}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <X size={17} />
              </button>
            </div>

            <form onSubmit={sendQR} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Monto (BOB) *</span>
                <input autoFocus type="number" min="1" step="0.01"
                  value={qrAmt} onChange={e => setQrAmt(e.target.value)}
                  placeholder="ej: 250.00" required
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-transparent" />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Concepto</span>
                <input value={qrDesc} onChange={e => setQrDesc(e.target.value)}
                  placeholder="ej: Pago electricidad enero"
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-transparent" />
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Banco</span>
                <div className="grid grid-cols-3 gap-2">
                  {['bmsc', 'bnb', 'bisa'].map(b => (
                    <button key={b} type="button" onClick={() => setQrBank(b)}
                      className={`py-2.5 rounded-xl text-sm font-bold border-2 transition-all
                        ${qrBank === b
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 scale-105'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      {b.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit"
                disabled={!qrAmt || parseFloat(qrAmt) <= 0 || qrSending}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm transition-colors mt-1">
                {qrSending
                  ? <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generando...
                    </span>
                  : '⚡ Generar y enviar QR'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
