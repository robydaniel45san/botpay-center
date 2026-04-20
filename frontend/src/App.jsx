import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { SocketProvider } from './context/SocketContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Inbox from './pages/Inbox'
import Contacts from './pages/Contacts'
import Payments from './pages/Payments'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

// SocketProvider necesita estar dentro de BrowserRouter (usa useNavigate)
// y dentro de AuthProvider (usa useAuth) y ToastProvider (usa useToast)
function AppProviders({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <SocketProvider>
          {children}
        </SocketProvider>
      </ToastProvider>
    </AuthProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/inbox" replace />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/inbox" replace />} />
        </Routes>
      </AppProviders>
    </BrowserRouter>
  )
}
