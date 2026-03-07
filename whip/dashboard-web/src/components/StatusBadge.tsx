import type { TaskStatus } from '../api/types'

const statusConfig: Record<TaskStatus, { icon: string; label: string; className: string }> = {
  created: {
    icon: '○',
    label: 'created',
    className: 'text-gray-500 dark:text-gray-500',
  },
  assigned: {
    icon: '◐',
    label: 'assigned',
    className: 'text-amber-500 dark:text-amber-400',
  },
  in_progress: {
    icon: '▶',
    label: 'in_progress',
    className: 'text-indigo-500 dark:text-indigo-400 font-bold',
  },
  review: {
    icon: '◎',
    label: 'review',
    className: 'text-pink-500 dark:text-pink-400 font-bold',
  },
  completed: {
    icon: '✓',
    label: 'completed',
    className: 'text-emerald-500 dark:text-emerald-400',
  },
  failed: {
    icon: '✗',
    label: 'failed',
    className: 'text-red-500 dark:text-red-400',
  },
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const config = statusConfig[status] ?? { icon: '?', label: status, className: 'text-gray-400' }
  return (
    <span className={config.className}>
      {config.icon} {config.label}
    </span>
  )
}
