import { useState, useEffect, useRef, useCallback } from 'react'
import type { Task } from '../api/types'
import type { TaskListMode, WhipClient } from '../api/client'
import { AuthError, ConnectionError } from '../api/client'

const DEFAULT_POLL_INTERVAL = 2000

interface Callbacks {
  onAuthError: () => void
  onConnectionError: () => void
  onConnectionSuccess: () => void
}

export function useTasks(
  client: WhipClient | null,
  mode: TaskListMode,
  callbacks: Callbacks,
  pollInterval: number = DEFAULT_POLL_INTERVAL,
) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [error, setError] = useState<string | null>(null)
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  const fetchTasks = useCallback(async (signal?: AbortSignal) => {
    if (!client) return
    try {
      const data = await client.getTasks(mode, signal)
      if (signal?.aborted) return
      setTasks(data)
      setError(null)
      callbacksRef.current.onConnectionSuccess()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof AuthError) {
        callbacksRef.current.onAuthError()
        return
      }
      if (err instanceof ConnectionError) {
        callbacksRef.current.onConnectionError()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks')
    }
  }, [client, mode])

  useEffect(() => {
    setTasks([])
    setError(null)
  }, [client, mode])

  useEffect(() => {
    const controller = new AbortController()
    fetchTasks(controller.signal)
    const id = setInterval(() => fetchTasks(controller.signal), pollInterval)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [fetchTasks, pollInterval])

  return { tasks, error }
}
