import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useCallback, useEffect } from 'react'
import { Layout } from './components/Layout'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { getClient, saveAuth } from './stores/auth'
import { WhipAPIClient, parseConnectURL } from './api/client'

export default function App() {
  const [authed, setAuthed] = useState(() => getClient() !== null)
  const [hashChecked, setHashChecked] = useState(false)

  const handleLogin = useCallback(() => setAuthed(true), [])
  const handleLogout = useCallback(() => setAuthed(false), [])

  // Backward compat: auto-connect from hash fragment on any route
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) {
      setHashChecked(true)
      return
    }
    const parsed = parseConnectURL(hash)
    if (!parsed) {
      setHashChecked(true)
      return
    }
    window.history.replaceState({}, '', window.location.pathname)
    const client = new WhipAPIClient(parsed.baseURL, parsed.token)
    client.getPeers().then(() => {
      saveAuth(parsed)
      setAuthed(true)
      setHashChecked(true)
    }).catch(() => {
      setHashChecked(true)
    })
  }, [])

  if (!hashChecked) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0B1120] flex items-center justify-center">
        <svg className="animate-spin h-6 w-6 text-[#8B5CF6]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          authed ? <Navigate to="/dashboard" replace /> : <LandingPage />
        } />
        <Route path="/login" element={
          authed
            ? <Navigate to="/dashboard" replace />
            : <Layout><LoginPage onLogin={handleLogin} /></Layout>
        } />
        <Route path="/dashboard" element={
          authed
            ? <Layout><DashboardPage onDisconnect={handleLogout} /></Layout>
            : <Navigate to="/login" replace />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
