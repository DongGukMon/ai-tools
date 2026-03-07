import { useState, useEffect, useRef, useCallback } from 'react'
import type { Task } from '../api/types'
import type { WhipAPIClient } from '../api/client'
import { AuthError, ConnectionError } from '../api/client'

const POLL_INTERVAL = 2000

export function useTasks(client: WhipAPIClient | null, onAuthError: () => void) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [error, setError] = useState<string | null>(null)
  const onAuthErrorRef = useRef(onAuthError)
  onAuthErrorRef.current = onAuthError

  const fetchTasks = useCallback(async () => {
    if (!client) return
    try {
      const data = await client.getTasks()
      setTasks(data)
      setError(null)
    } catch (err) {
      if (err instanceof AuthError || err instanceof ConnectionError) {
        onAuthErrorRef.current()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks')
    }
  }, [client])

  useEffect(() => {
    fetchTasks()
    const id = setInterval(fetchTasks, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchTasks])

  return { tasks, error }
}
