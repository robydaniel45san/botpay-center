import { createContext, useContext, useState, useEffect } from 'react'
import api from '../lib/api'
import { connectSocket, disconnectSocket } from '../lib/socket'

const AuthContext = createContext(null)

// Clave unificada del token en localStorage
const TOKEN_KEY = 'token'

export function AuthProvider({ children }) {
  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      api.get('/auth/me')
        .then((res) => {
          setAgent(res.data)
          connectSocket(token)
        })
        .catch(() => localStorage.removeItem(TOKEN_KEY))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    const { token, agent: agentData } = res.data
    localStorage.setItem(TOKEN_KEY, token)
    setAgent(agentData)
    connectSocket(token)
    return agentData
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch {}
    localStorage.removeItem(TOKEN_KEY)
    disconnectSocket()
    setAgent(null)
  }

  return (
    <AuthContext.Provider value={{ agent, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
