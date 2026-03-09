import type { TaskStatus } from '../api/types'
import { getTaskStatusDisplay } from '../lib/taskStatus'

export function StatusBadge({ status }: { status: TaskStatus }) {
  const config = getTaskStatusDisplay(status)
  return (
    <span className={config.className}>
      {config.icon} {config.label}
    </span>
  )
}
