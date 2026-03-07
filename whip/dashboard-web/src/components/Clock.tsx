import { useState, useEffect } from 'react'

export function Clock() {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="text-xs font-mono text-gray-400 dark:text-gray-500 tabular-nums">
      {time.toLocaleTimeString()}
    </span>
  )
}
