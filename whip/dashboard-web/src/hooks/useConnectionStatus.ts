import { useState, useCallback, useRef, useEffect } from 'react'

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

const BASE_INTERVAL = 2000
const MAX_INTERVAL = 30000

export function getBackoffInterval(retryCount: number): number {
  return Math.min(BASE_INTERVAL * Math.pow(2, retryCount), MAX_INTERVAL)
}

export function useConnectionStatus(onLogout: () => void) {
  const [status, setStatus] = useState<ConnectionStatus>('connected')
  const [retryCount, setRetryCount] = useState(0)
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout

  // Reset retry state when the page becomes visible again.
  // Background-accumulated errors should not count toward disconnection.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setRetryCount(0)
        setStatus('connected')
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const onConnectionError = useCallback(() => {
    setRetryCount(prev => {
      const next = prev + 1
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
