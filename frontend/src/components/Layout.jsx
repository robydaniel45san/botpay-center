import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from './Sidebar'

export default function Layout() {
  const { agent, loading } = useAuth()

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-900">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!agent) return <Navigate to="/login" replace />

  return (
    <div className="flex h-full bg-slate-100">
      <Sidebar />
      <main className="ml-16 flex-1 overflow-hidden h-full">
        <Outlet />
      </main>
    </div>
  )
}
