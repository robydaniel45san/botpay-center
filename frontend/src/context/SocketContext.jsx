import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const { agent } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [connected, setConnected] = useState(false)
  const [onlineAgents, setOnlineAgents] = useState([])
  const initialized = useRef(false)

  useEffect(() => {
    if (!agent) {
      disconnectSocket()
      setConnected(false)
      initialized.current = false
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return

    const socket = connectSocket(token)
    initialized.current = true

    // ── Estado de conexión ──────────────────────────────
    const onConnect = () => {
      setConnected(true)
    }

    const onDisconnect = (reason) => {
      setConnected(false)
      if (reason === 'io server disconnect') {
        // Desconexión forzada por el servidor (token expirado, etc.)
        toast.warning('Sesión desconectada', 'Reconectando...')
      }
    }

    const onConnectError = (err) => {
      if (err.message === 'auth:required' || err.message === 'auth:invalid') {
        toast.error('Sesión expirada', 'Por favor, inicia sesión nuevamente')
        disconnectSocket()
        navigate('/login')
      }
    }

    // ── Agentes online/offline ──────────────────────────
    const onAgentOnline = ({ agentId, name }) => {
      setOnlineAgents((prev) =>
        prev.includes(agentId) ? prev : [...prev, agentId]
      )
      if (agentId !== agent.id) {
        toast.info(`${name} se conectó`, null, { duration: 3000 })
      }
    }

    const onAgentOffline = ({ agentId, name }) => {
      setOnlineAgents((prev) => prev.filter((id) => id !== agentId))
    }

    // ── Nuevos mensajes (cualquier conversación) ────────
    const onNewMessage = ({ conversationId, contact, message }) => {
      // Solo notificar si el mensaje es entrante (del cliente)
      if (message?.direction === 'inbound') {
        toast.info(
          contact?.name || contact?.phone || 'Nuevo mensaje',
          message?.content?.slice(0, 60) || 'Mensaje recibido',
          { duration: 5000 }
        )
      }
    }

    // ── Pagos recibidos ────────────────────────────────
    const onPaymentReceived = ({ contact, amount, currency }) => {
      toast.success(
        '💰 Pago recibido',
        `${contact?.name || 'Cliente'} pagó ${currency || 'BOB'} ${parseFloat(amount || 0).toFixed(2)}`,
        { duration: 6000 }
      )
    }

    // ── Nuevas citas agendadas ─────────────────────────
    const onAppointmentCreated = ({ contact, service, date }) => {
      toast.info(
        '📅 Nueva cita',
        `${contact?.name || 'Cliente'} agendó ${service || ''} para ${date || ''}`,
        { duration: 5000 }
      )
    }

    // ── Conversación asignada al agente actual ─────────
    const onConversationAssigned = ({ conversationId, contact }) => {
      toast.warning(
        '💬 Conversación asignada',
        `${contact?.name || contact?.phone} fue asignado a ti`,
        { duration: 6000 }
      )
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('agent:online', onAgentOnline)
    socket.on('agent:offline', onAgentOffline)
    socket.on('new_message', onNewMessage)
    socket.on('payment_received', onPaymentReceived)
    socket.on('appointment_created', onAppointmentCreated)
    socket.on(`agent:${agent.id}:conversation_assigned`, onConversationAssigned)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('agent:online', onAgentOnline)
      socket.off('agent:offline', onAgentOffline)
      socket.off('new_message', onNewMessage)
      socket.off('payment_received', onPaymentReceived)
      socket.off('appointment_created', onAppointmentCreated)
      socket.off(`agent:${agent.id}:conversation_assigned`, onConversationAssigned)
    }
  }, [agent])

  return (
    <SocketContext.Provider value={{ connected, onlineAgents, socket: agent ? getSocket() : null }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
