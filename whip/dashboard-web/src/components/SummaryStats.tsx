import type { Task, TaskStatus } from '../api/types'

const statusDisplay: { key: TaskStatus; icon: string; className: string }[] = [
  { key: 'created', icon: '●', className: 'text-gray-500 dark:text-gray-500' },
  { key: 'assigned', icon: '◐', className: 'text-amber-500 dark:text-amber-400' },
  { key: 'in_progress', icon: '▶', className: 'text-indigo-500 dark:text-indigo-400' },
  { key: 'review', icon: '◎', className: 'text-pink-500 dark:text-pink-400' },
  { key: 'approved_pending_finalize', icon: '◉', className: 'text-emerald-500 dark:text-emerald-400' },
  { key: 'completed', icon: '✓', className: 'text-emerald-500 dark:text-emerald-400' },
  { key: 'failed', icon: '✗', className: 'text-red-500 dark:text-red-400' },
]

export function SummaryStats({ tasks }: { tasks: Task[] }) {
  const counts: Record<string, number> = {}
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] || 0) + 1
  }

  return (
    <div className="inline-flex items-center gap-0 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-1.5 ml-2 max-w-full overflow-x-auto">
      <span className="font-bold text-gray-900 dark:text-gray-100">
        {tasks.length} total
      </span>
      {statusDisplay.map(({ key, icon, className }) => {
        const n = counts[key]
        if (!n) return null
        return (
          <span key={key} className="flex items-center">
            <span className="mx-2 text-gray-300 dark:text-gray-700">|</span>
            <span className={className}>
              {icon} {n} {key}
            </span>
          </span>
        )
      })}
    </div>
  )
}
