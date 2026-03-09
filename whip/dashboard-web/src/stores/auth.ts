import type { StoredConnectTarget, WhipClient } from '../api/client.ts'
import { coerceStoredConnectTarget, createClient } from '../api/client.ts'

const AUTH_KEY = 'whip-auth'

type AuthState = StoredConnectTarget

export function saveAuth(state: AuthState): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(state))
}

export function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    return coerceStoredConnectTarget(JSON.parse(raw))
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
