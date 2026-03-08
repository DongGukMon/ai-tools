import { useState, useCallback } from 'react'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { getClient } from './stores/auth'

export default function App() {
  const [authed, setAuthed] = useState(() => getClient() !== null)

  const handleLogin = useCallback(() => setAuthed(true), [])
  const handleLogout = useCallback(() => setAuthed(false), [])

  return (
    <Layout>
      {authed
        ? <DashboardPage onDisconnect={handleLogout} />
        : <LoginPage onLogin={handleLogin} />
      }
    </Layout>
  )
}
