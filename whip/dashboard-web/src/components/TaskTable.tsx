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

function PidCell({ pid, alive, status }: { pid: number; alive: boolean; status: Task['status'] }) {
  if (pid <= 0) {
    return <span className="text-gray-400 dark:text-gray-700">&mdash;</span>
  }
  if (alive) {
    return <span className="text-emerald-500 dark:text-emerald-400">● {pid}</span>
  }
  if (status === 'completed') {
    return <span className="text-amber-500 dark:text-amber-400">- {pid}</span>
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

// hidden = hidden on mobile, visible on md+
const H = 'hidden md:table-cell'

const columns = [
  { key: 'id', label: 'ID', width: 'w-[4.5rem]', hide: '' },
  { key: 'workspace', label: 'WORKSPACE', width: 'w-[8rem]', hide: H },
  { key: 'title', label: 'TITLE', width: 'min-w-[10rem] flex-1', hide: '' },
  { key: 'status', label: 'STATUS', width: 'w-[8.5rem]', hide: '' },
  { key: 'backend', label: 'BACKEND', width: 'w-[5.5rem]', hide: H },
  { key: 'runner', label: 'RUNNER', width: 'w-[5rem]', hide: H },
  { key: 'pid', label: 'PID', width: 'w-[6rem]', hide: H },
  { key: 'irc', label: 'IRC', width: 'w-[7.5rem]', hide: H },
  { key: 'deps', label: 'BLOCKED BY', width: 'w-[8rem]', hide: H },
  { key: 'note', label: 'NOTE', width: 'w-[10rem]', hide: H },
  { key: 'updated', label: 'UPDATED', width: 'w-[6rem]', hide: '' },
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
                className={`text-left py-2 px-1.5 font-bold text-gray-400 dark:text-gray-500 ${col.width} ${col.hide}`}
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
                <td className={`py-1.5 px-1.5 ${H}`}>
                  <span className="text-gray-700 dark:text-gray-300">
                    {truncate(task.workspace || 'global', 14)}
                  </span>
                </td>
                <td className="py-1.5 px-1.5 text-gray-900 dark:text-gray-100 truncate max-w-[10rem]">
                  {truncate(task.title, 24)}
                </td>
                <td className="py-1.5 px-1.5">
                  <StatusBadge status={task.status} />
                </td>
                <td className={`py-1.5 px-1.5 ${H}`}>
                  <BackendCell backend={task.backend} />
                </td>
                <td className={`py-1.5 px-1.5 ${H}`}>
                  <RunnerCell runner={task.runner} />
                </td>
                <td className={`py-1.5 px-1.5 ${H}`}>
                  <PidCell pid={task.shell_pid} alive={task.pid_alive} status={task.status} />
                </td>
                <td className={`py-1.5 px-1.5 ${H}`}>
                  {task.irc_name ? (
                    <span className="text-gray-700 dark:text-gray-300">
                      {truncate(task.irc_name, 10)}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-700">&mdash;</span>
                  )}
                </td>
                <td className={`py-1.5 px-1.5 ${H}`}>
                  <DepsCell deps={task.depends_on} />
                </td>
                <td className={`py-1.5 px-1.5 ${H}`}>
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
