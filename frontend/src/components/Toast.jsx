import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
}

const COLORS = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
}

const ICON_COLORS = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
}

function ToastItem({ toast, onRemove }) {
  const [visible, setVisible] = useState(false)
  const Icon = ICONS[toast.type] || Info

  useEffect(() => {
    // Entrada
    const t1 = setTimeout(() => setVisible(true), 10)
    // Salida animada
    const t2 = setTimeout(() => setVisible(false), (toast.duration || 4000) - 300)
    // Eliminar
    const t3 = setTimeout(() => onRemove(toast.id), toast.duration || 4000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [toast.id, toast.duration, onRemove])

  return (
    <div
      onClick={() => onRemove(toast.id)}
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg cursor-pointer
        max-w-sm w-full transition-all duration-300
        ${COLORS[toast.type] || COLORS.info}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      <Icon size={16} className={`mt-0.5 shrink-0 ${ICON_COLORS[toast.type]}`} />
      <div className="flex-1 min-w-0">
        {toast.title && <p className="font-semibold text-sm leading-tight">{toast.title}</p>}
        {toast.message && <p className="text-xs mt-0.5 opacity-80">{toast.message}</p>}
      </div>
      <button className="opacity-50 hover:opacity-100 transition-opacity shrink-0">
        <X size={13} />
      </button>
    </div>
  )
}

export default function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={onRemove} />
        </div>
      ))}
    </div>
  )
}
