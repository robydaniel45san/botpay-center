import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../lib/api'
import { getSocket } from '../lib/socket'
import { Send, Bot, User, Clock, CheckCheck, Search, UserCheck, QrCode, X, AlertTriangle } from 'lucide-react'

const STATUS_LABELS = { bot: 'Bot', open: 'Agente', pending: 'Pendiente', resolved: 'Resuelto' }
const STATUS_COLORS = {
  bot:      'bg-blue-100 text-blue-700',
  open:     'bg-green-100 text-green-700',
  pending:  'bg-yellow-100 text-yellow-700',
  resolved: 'bg-slate-100 text-slate-500',
}

function ConversationItem({ conv, active, onClick }) {
  const contact = conv.contact
  const initials = contact?.name?.charAt(0)?.toUpperCase() ?? contact?.phone?.slice(-2) ?? '?'
  const time = conv.last_message_at
    ? new Date(conv.last_message_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-3 hover:bg-slate-50 border-b border-slate-100 transition-colors text-left
        ${active ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
    >
      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-800 text-sm truncate">
            {contact?.name || contact?.phone}
          </span>
          <span className="text-xs text-slate-400 shrink-0 ml-1">{time}</span>
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">{conv.last_message_preview || '—'}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[conv.status]}`}>
            {STATUS_LABELS[conv.status]}
          </span>
          {conv.unread_count > 0 && (
            <span className="bg-indigo-600 text-white text-[10px] rounded-full px-1.5 font-bold">
              {conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function MessageBubble({ msg }) {
  const isOut = msg.direction === 'outbound'
  const icon = msg.sender_type === 'bot'
    ? <Bot size={12} />
    : msg.sender_type === 'agent'
    ? <User size={12} />
    : null
  const time = msg.sent_at
    ? new Date(msg.sent_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
    : ''

  const qrBase64 = msg.metadata?.qr_base64
  const isQR = msg.type === 'image' && qrBase64

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[72%] rounded-2xl px-3 py-2 text-sm shadow-sm
        ${isOut
          ? 'bg-indigo-600 text-white rounded-br-sm'
          : 'bg-white text-slate-800 rounded-bl-sm border border-slate-100'}`}
      >
        {isQR ? (
          <div className="flex flex-col items-center gap-2">
            <img
              src={qrBase64}
              alt="Código QR"
              className="w-48 h-48 rounded-lg bg-white p-1"
            />
            {msg.content && (
              <p className="text-xs opacity-80 text-center">{msg.content}</p>
            )}
          </div>
        ) : (
          <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content || `[${msg.type}]`}</p>
        )}
        <div className={`flex items-center justify-end gap-1 mt-1 ${isOut ? 'text-indigo-200' : 'text-slate-400'}`}>
          {icon && <span className="opacity-70">{icon}</span>}
          <span className="text-[10px]">{time}</span>
          {isOut && <CheckCheck size={11} className="opacity-70" />}
        </div>
      </div>
    </div>
  )
}

export default function Inbox() {
  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [qrModal, setQrModal] = useState(false)
  const [qrAmount, setQrAmount] = useState('')
  const [qrDesc, setQrDesc] = useState('')
  const [qrBank, setQrBank] = useState('bmsc')
  const [sendingQr, setSendingQr] = useState(false)
  const [watchdogAlerts, setWatchdogAlerts] = useState([])
  const bottomRef = useRef(null)

  // Cargar conversaciones
  const loadConversations = useCallback(async () => {
    try {
      const params = {}
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/crm/conversations', { params })
      setConversations(res.data || [])
    } finally {
      setLoadingConvs(false)
    }
  }, [search, statusFilter])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Cargar mensajes al seleccionar conversación
  const openConversation = async (conv) => {
    setActiveConv(conv)
    const res = await api.get(`/crm/conversations/${conv.id}`)
    setMessages(res.data.messages || [])
    const socket = getSocket()
    socket.emit('join_conversation', conv.id)
  }

  // Socket.io — mensajes en tiempo real
  useEffect(() => {
    const socket = getSocket()
    socket.on('new_message', ({ conversationId, message }) => {
      if (activeConv?.id === conversationId) {
        setMessages((prev) => [...prev, message])
      }
      loadConversations()
    })
    socket.on('inbox_update', () => loadConversations())
    socket.on('payment_received', ({ conversationId }) => {
      if (activeConv?.id === conversationId) openConversation(activeConv)
      loadConversations()
    })
    socket.on('watchdog:alert', (alert) => {
      if (alert.status === 'down') {
        setWatchdogAlerts((prev) => {
          const exists = prev.find((a) => a.service === alert.service)
          return exists ? prev : [...prev, alert]
        })
        // Auto-dismiss después de 10s si se recupera
        setTimeout(() => {
          setWatchdogAlerts((prev) => prev.filter((a) => a.service !== alert.service || a.status !== 'down'))
        }, 10_000)
      } else {
        setWatchdogAlerts((prev) => prev.filter((a) => a.service !== alert.service))
      }
    })
    return () => {
      socket.off('new_message')
      socket.off('inbox_update')
      socket.off('payment_received')
      socket.off('watchdog:alert')
    }
  }, [activeConv, loadConversations])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!text.trim() || !activeConv || sending) return
    setSending(true)
    try {
      const res = await api.post(`/crm/conversations/${activeConv.id}/messages`, { text: text.trim() })
      setMessages((prev) => [...prev, res.data])
      setText('')
    } finally {
      setSending(false)
    }
  }

  const assignToMe = async () => {
    // Obtener el id del agente actual desde localStorage
    const agent = JSON.parse(localStorage.getItem('bp_agent') || 'null')
    if (!agent || !activeConv) return
    await api.post(`/crm/conversations/${activeConv.id}/assign`, { agentId: agent.id })
    loadConversations()
    openConversation(activeConv)
  }

  const resumeBot = async () => {
    if (!activeConv) return
    await api.post(`/crm/conversations/${activeConv.id}/bot-resume`)
    loadConversations()
  }

  const sendQR = async (e) => {
    e.preventDefault()
    const amount = parseFloat(qrAmount)
    if (!amount || amount <= 0 || !activeConv) return
    setSendingQr(true)
    try {
      await api.post(`/crm/conversations/${activeConv.id}/qr`, {
        amount,
        description: qrDesc.trim() || 'Cobro CRM',
        bank: qrBank,
      })
      setQrModal(false)
      setQrAmount('')
      setQrDesc('')
      setQrBank('bmsc')
      openConversation(activeConv)
    } finally {
      setSendingQr(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* ── Alertas Watchdog ─────────────────────────── */}
      {watchdogAlerts.length > 0 && (
        <div className="flex flex-col gap-1 px-3 pt-2">
          {watchdogAlerts.map((a) => (
            <div key={a.service} className="flex items-center justify-between gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle size={13} />
                <span><strong>{a.service}</strong> — {a.error || 'Sin respuesta'}</span>
              </div>
              <button onClick={() => setWatchdogAlerts((p) => p.filter((x) => x.service !== a.service))} className="opacity-60 hover:opacity-100">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    <div className="flex flex-1 overflow-hidden">
      {/* ── Lista de conversaciones ─────────────────── */}
      <div className="w-80 border-r border-slate-200 flex flex-col shrink-0">
        {/* Header */}
        <div className="p-3 border-b border-slate-200">
          <h2 className="font-bold text-slate-800 mb-2">Bandeja</h2>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contacto..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div className="flex gap-1 mt-2">
            {['', 'bot', 'open', 'pending', 'resolved'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors
                  ${statusFilter === s
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-slate-200 text-slate-500 hover:border-indigo-300'}`}
              >
                {s === '' ? 'Todo' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs
            ? <p className="text-center text-slate-400 text-sm mt-8">Cargando...</p>
            : conversations.length === 0
            ? <p className="text-center text-slate-400 text-sm mt-8">Sin conversaciones</p>
            : conversations.map((c) => (
                <ConversationItem
                  key={c.id}
                  conv={c}
                  active={activeConv?.id === c.id}
                  onClick={() => openConversation(c)}
                />
              ))
          }
        </div>
      </div>

      {/* ── Vista de chat ───────────────────────────── */}
      {activeConv ? (
        <div className="flex-1 flex flex-col">
          {/* Header del chat */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                {activeConv.contact?.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">
                  {activeConv.contact?.name || activeConv.contact?.phone}
                </p>
                <p className="text-xs text-slate-400">{activeConv.contact?.phone}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {activeConv.status === 'bot' && (
                <button
                  onClick={assignToMe}
                  className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <UserCheck size={13} /> Tomar
                </button>
              )}
              {activeConv.status === 'open' && (
                <button
                  onClick={resumeBot}
                  className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Bot size={13} /> Pasar al bot
                </button>
              )}
              <button
                onClick={() => setQrModal(true)}
                className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
                title="Generar y enviar QR"
              >
                <QrCode size={13} /> QR
              </button>
              <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[activeConv.status]}`}>
                {STATUS_LABELS[activeConv.status]}
              </span>
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50">
            {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="flex items-center gap-2 px-4 py-3 border-t border-slate-200 bg-white">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={activeConv.status === 'bot' ? 'Toma la conversación para responder...' : 'Escribe un mensaje...'}
              disabled={activeConv.status !== 'open' || sending}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
            />
            <button
              type="submit"
              disabled={!text.trim() || activeConv.status !== 'open' || sending}
              className="w-9 h-9 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center text-slate-400">
            <Clock size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecciona una conversación</p>
          </div>
        </div>
      )}

      {/* ── Modal Generar QR de cobro ───────────────── */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <QrCode size={18} className="text-emerald-600" />
                <h3 className="font-semibold text-slate-800">Generar cobro QR</h3>
              </div>
              <button
                onClick={() => { setQrModal(false); setQrAmount(''); setQrDesc(''); setQrBank('bmsc') }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={sendQR} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Monto (BOB) *</label>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  step="0.01"
                  value={qrAmount}
                  onChange={(e) => setQrAmount(e.target.value)}
                  placeholder="ej: 250.00"
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Concepto</label>
                <input
                  value={qrDesc}
                  onChange={(e) => setQrDesc(e.target.value)}
                  placeholder="ej: Camisa casual, Consulta médica..."
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Banco</label>
                <select
                  value={qrBank}
                  onChange={(e) => setQrBank(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                >
                  <option value="bmsc">🏦 BMSC</option>
                  <option value="bnb">🏦 BNB</option>
                  <option value="bisa">🏦 BISA</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={!qrAmount || parseFloat(qrAmount) <= 0 || sendingQr}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
              >
                {sendingQr ? 'Generando...' : 'Generar y enviar QR'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
