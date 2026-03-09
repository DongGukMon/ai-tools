import type { Task, TaskStatus } from '../api/types'
import { getTaskStatusDisplay } from '../lib/taskStatus'

const statusDisplay: TaskStatus[] = [
  'created',
  'assigned',
  'in_progress',
  'review',
  'approved',
  'failed',
  'completed',
  'canceled',
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
      {statusDisplay.map((key) => {
        const n = counts[key]
        if (!n) return null
        const config = getTaskStatusDisplay(key)
        return (
          <span key={key} className="flex items-center">
            <span className="mx-2 text-gray-300 dark:text-gray-700">|</span>
            <span className={config.className}>
              {config.icon} {n} {config.label}
            </span>
          </span>
        )
      })}
    </div>
  )
}
