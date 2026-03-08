import { useState, useCallback, useRef } from 'react'

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

const BASE_INTERVAL = 2000
const MAX_INTERVAL = 30000
const MAX_RETRIES = 20

export function getBackoffInterval(retryCount: number): number {
  return Math.min(BASE_INTERVAL * Math.pow(2, retryCount), MAX_INTERVAL)
}

export function useConnectionStatus(onLogout: () => void) {
  const [status, setStatus] = useState<ConnectionStatus>('connected')
  const [retryCount, setRetryCount] = useState(0)
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout

  const onConnectionError = useCallback(() => {
    setRetryCount(prev => {
      const next = prev + 1
      if (next >= MAX_RETRIES) {
        setStatus('disconnected')
        onLogoutRef.current()
        return 0
      }
      setStatus('reconnecting')
      return next
    })
  }, [])

  const onConnectionSuccess = useCallback(() => {
    setStatus('connected')
    setRetryCount(0)
  }, [])

  const onAuthError = useCallback(() => {
    setStatus('disconnected')
    setRetryCount(0)
    onLogoutRef.current()
  }, [])

  return { status, retryCount, onConnectionError, onConnectionSuccess, onAuthError }
}
