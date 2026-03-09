import type { ConnectTarget, WhipClient } from '../api/client'
import { createClient } from '../api/client'

const AUTH_KEY = 'whip-auth'

type AuthState = ConnectTarget

export function saveAuth(state: AuthState): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(state))
}

export function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthState
  } catch {
    return null
  }
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY)
}

export function getClient(): WhipClient | null {
  const auth = loadAuth()
  if (!auth) return null
  return createClient(auth)
}
