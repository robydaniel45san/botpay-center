import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import {
  MessageSquare, Users, CreditCard,
  BarChart2, Settings, LogOut, Bot
} from 'lucide-react'

const BUSINESS_NAME = import.meta.env.VITE_BUSINESS_NAME || 'BotPay'

const links = [
  { to: '/inbox',    icon: MessageSquare, label: 'Bandeja' },
  { to: '/contacts', icon: Users,         label: 'Contactos' },
  { to: '/payments', icon: CreditCard,    label: 'Pagos' },
  { to: '/reports',  icon: BarChart2,     label: 'Reportes' },
  { to: '/settings', icon: Settings,      label: 'Ajustes' },
]

export default function Sidebar() {
  const { agent, logout } = useAuth()
  const { connected } = useSocket() || {}
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 bg-slate-900 flex flex-col items-center py-4 gap-1 z-50">
      {/* Logo */}
      <div className="mb-4 p-2 bg-indigo-600 rounded-xl relative" title={BUSINESS_NAME}>
        <Bot size={24} className="text-white" />
        <span
          title={connected ? 'Tiempo real activo' : 'Sin conexión en tiempo real'}
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 transition-colors
            ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`}
        />
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 flex-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-12 h-12 rounded-xl text-xs gap-0.5 transition-colors
               ${isActive
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`
            }
          >
            <Icon size={18} />
            <span className="text-[9px] leading-none">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Agent avatar + logout */}
      <div className="flex flex-col items-center gap-2 mt-2">
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold uppercase">
            {agent?.name?.charAt(0) ?? 'A'}
          </div>
          {/* Punto verde = agente online */}
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-900" />
        </div>
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          className="text-slate-500 hover:text-red-400 transition-colors"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
