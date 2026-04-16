import { io } from 'socket.io-client'

let socket = null

const getToken = () => localStorage.getItem('token')

export const getSocket = () => {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      autoConnect: false,
      auth: { token: getToken() },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
    })

    // Actualizar token en cada intento de reconexión (por si expiró y se renovó)
    socket.on('reconnect_attempt', () => {
      socket.auth = { token: getToken() }
    })
  }
  return socket
}

export const connectSocket = (token) => {
  const s = getSocket()
  if (token) s.auth = { token }
  if (!s.connected) s.connect()
  return s
}

export const disconnectSocket = () => {
  if (socket?.connected) socket.disconnect()
}

// Helpers para salas de conversación
export const joinConversation = (id) => getSocket().emit('join_conversation', id)
export const leaveConversation = (id) => getSocket().emit('leave_conversation', id)
export const sendTyping = (conversationId, typing) =>
  getSocket().emit('agent_typing', { conversationId, typing })
