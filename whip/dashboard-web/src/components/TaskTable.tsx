import type { Task } from '../api/types'
import { StatusBadge } from './StatusBadge'
import { timeAgo, truncate } from '../lib/format'

interface TaskTableProps {
  tasks: Task[]
  selectedId: string | null
  onSelect: (task: Task) => void
}

function BackendCell({ backend }: { backend: string }) {
  switch (backend) {
    case 'claude':
      return <span className="text-purple-400 dark:text-purple-300">claude</span>
    case 'codex':
      return <span className="text-emerald-500 dark:text-emerald-400">codex</span>
    default:
      return <span className="text-gray-400 dark:text-gray-700">&mdash;</span>
  }
}

function RunnerCell({ runner }: { runner: string }) {
  switch (runner) {
    case 'tmux':
      return <span className="text-indigo-500 dark:text-indigo-400">tmux</span>
    case 'terminal':
      return <span className="text-amber-500 dark:text-amber-400">term</span>
    default:
      return <span className="text-gray-400 dark:text-gray-700">&mdash;</span>
  }
}

function PidCell({ pid, alive }: { pid: number; alive: boolean }) {
  if (pid <= 0) {
    return <span className="text-gray-400 dark:text-gray-700">&mdash;</span>
  }
  if (alive) {
    return <span className="text-emerald-500 dark:text-emerald-400">● {pid}</span>
  }
  return <span className="text-red-500 dark:text-red-400">✗ {pid}</span>
}

function DepsCell({ deps }: { deps: string[] }) {
  if (!deps || deps.length === 0) {
    return <span className="text-gray-400 dark:text-gray-700">&mdash;</span>
  }
  const short = deps.map(d => d.length > 5 ? d.slice(0, 5) : d)
  return <span className="text-amber-500 dark:text-amber-400">{short.join(',')}</span>
}

const columns = [
  { key: 'id', label: 'ID', width: 'w-[4.5rem]' },
  { key: 'title', label: 'TITLE', width: 'min-w-[10rem] flex-1' },
  { key: 'status', label: 'STATUS', width: 'w-[8.5rem]' },
  { key: 'backend', label: 'BACKEND', width: 'w-[5.5rem]' },
  { key: 'runner', label: 'RUNNER', width: 'w-[5rem]' },
  { key: 'pid', label: 'PID', width: 'w-[6rem]' },
  { key: 'irc', label: 'IRC', width: 'w-[7.5rem]' },
  { key: 'deps', label: 'DEPS', width: 'w-[8rem]' },
  { key: 'note', label: 'NOTE', width: 'w-[10rem]' },
  { key: 'updated', label: 'UPDATED', width: 'w-[6rem]' },
] as const

export function TaskTable({ tasks, selectedId, onSelect }: TaskTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {/* Selection indicator column */}
            <th className="w-6" />
            {columns.map(col => (
              <th
                key={col.key}
                className={`text-left py-2 px-1.5 font-bold text-gray-400 dark:text-gray-500 ${col.width}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => {
            const isSelected = task.id === selectedId
            return (
              <tr
                key={task.id}
                onClick={() => onSelect(task)}
                className={`cursor-pointer border-b border-transparent transition-colors ${
                  isSelected
                    ? 'bg-indigo-950/60 dark:bg-[#1E1B4B]'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <td className="w-6 text-center">
                  {isSelected && (
                    <span className="text-purple-400 font-bold">▸</span>
                  )}
                </td>
                <td className="py-1.5 px-1.5 text-amber-500 dark:text-amber-400">
                  {task.id.slice(0, 7)}
                </td>
                <td className="py-1.5 px-1.5 text-gray-900 dark:text-gray-100 truncate max-w-[10rem]">
                  {truncate(task.title, 24)}
                </td>
                <td className="py-1.5 px-1.5">
                  <StatusBadge status={task.status} />
                </td>
                <td className="py-1.5 px-1.5">
                  <BackendCell backend={task.backend} />
                </td>
                <td className="py-1.5 px-1.5">
                  <RunnerCell runner={task.runner} />
                </td>
                <td className="py-1.5 px-1.5">
                  <PidCell pid={task.shell_pid} alive={task.pid_alive} />
                </td>
                <td className="py-1.5 px-1.5">
                  {task.irc_name ? (
                    <span className="text-gray-700 dark:text-gray-300">
                      {truncate(task.irc_name, 10)}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-700">&mdash;</span>
                  )}
                </td>
                <td className="py-1.5 px-1.5">
                  <DepsCell deps={task.depends_on} />
                </td>
                <td className="py-1.5 px-1.5">
                  {task.note ? (
                    <span className="text-gray-500 dark:text-gray-400">
                      {truncate(task.note, 18)}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-700">&mdash;</span>
                  )}
                </td>
                <td className="py-1.5 px-1.5 text-gray-500 dark:text-gray-500">
                  {timeAgo(task.updated_at)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {tasks.length === 0 && (
        <div className="py-12 text-center text-gray-400 dark:text-gray-600">
          No tasks yet
        </div>
      )}
    </div>
  )
}
