import type { TaskStatus } from '../api/types'

type TaskStatusDisplay = {
  icon: string
  label: string
  className: string
}

export const taskStatusDisplay: Record<TaskStatus, TaskStatusDisplay> = {
  created: {
    icon: '○',
    label: 'new',
    className: 'text-gray-500 dark:text-gray-500',
  },
  assigned: {
    icon: '◐',
    label: 'queued',
    className: 'text-amber-500 dark:text-amber-400',
  },
  in_progress: {
    icon: '▶',
    label: 'active',
    className: 'text-indigo-500 dark:text-indigo-400 font-bold',
  },
  review: {
    icon: '◎',
    label: 'review',
    className: 'text-pink-500 dark:text-pink-400 font-bold',
  },
  approved: {
    icon: '◉',
    label: 'approved',
    className: 'text-emerald-500 dark:text-emerald-400 font-bold',
  },
  completed: {
    icon: '✓',
    label: 'done',
    className: 'text-emerald-500 dark:text-emerald-400',
  },
  failed: {
    icon: '✗',
    label: 'failed',
    className: 'text-red-500 dark:text-red-400',
  },
  canceled: {
    icon: '⊘',
    label: 'canceled',
    className: 'text-slate-500 dark:text-slate-400',
  },
}

export function getTaskStatusDisplay(status: TaskStatus): TaskStatusDisplay {
  return taskStatusDisplay[status] ?? {
    icon: '?',
    label: status,
    className: 'text-gray-400 dark:text-gray-500',
  }
}
