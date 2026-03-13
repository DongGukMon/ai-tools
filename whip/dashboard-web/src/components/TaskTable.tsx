import { useEffect, useMemo, useState } from 'react'
import type { Task } from '../api/types'
import { StatusBadge } from './StatusBadge'
import { timeAgo, truncate } from '../lib/format'
import { buildTaskTableRows } from '../lib/taskTableGrouping'

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

function ChevronButton({
  expanded,
  onToggle,
}: {
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-label={expanded ? 'Collapse workspace tasks' : 'Expand workspace tasks'}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-sm font-bold text-amber-500 transition-colors hover:bg-gray-100 hover:text-amber-600 dark:text-amber-400 dark:hover:bg-slate-800 dark:hover:text-amber-300"
    >
      {expanded ? '▼' : '▶'}
    </button>
  )
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
  { key: 'irc', label: 'IRC', width: 'w-[7.5rem]', hide: H },
  { key: 'deps', label: 'BLOCKED BY', width: 'w-[8rem]', hide: H },
  { key: 'note', label: 'NOTE', width: 'w-[10rem]', hide: H },
  { key: 'updated', label: 'UPDATED', width: 'w-[6rem]', hide: '' },
] as const

export function TaskTable({ tasks, selectedId, onSelect }: TaskTableProps) {
  const [expandedWorkspace, setExpandedWorkspace] = useState<string | null>(null)
  const rows = useMemo(
    () => buildTaskTableRows(tasks, expandedWorkspace),
    [expandedWorkspace, tasks],
  )

  useEffect(() => {
    if (!expandedWorkspace) {
      return
    }
    const stillExpanded = rows.some(
      row => row.kind === 'lead' && row.workspace === expandedWorkspace && row.isExpanded,
    )
    if (!stillExpanded) {
      setExpandedWorkspace(null)
    }
  }, [expandedWorkspace, rows])

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
          {rows.map(row => {
            const task = row.task
            const isSelected = task.id === selectedId
            return (
              <tr
                key={task.id}
                onClick={() => onSelect(task)}
                className={`cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-[#1E1B4B]'
                    : row.kind === 'worker'
                      ? 'bg-gray-50/60 hover:bg-gray-100/70 dark:bg-slate-900/40 dark:hover:bg-slate-800/50'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'
                } ${
                  row.kind === 'worker'
                    ? 'border-b border-gray-100/40 dark:border-gray-800/20'
                    : 'border-b border-gray-100 dark:border-gray-800/50'
                }`}
              >
                <td className={`w-6 border-l-2 text-center ${isSelected ? 'border-l-indigo-500 dark:border-l-indigo-300' : 'border-l-transparent'}`}>
                  {row.kind === 'lead' ? (
                    <ChevronButton
                      expanded={row.isExpanded}
                      onToggle={() => {
                        setExpandedWorkspace(current =>
                          current === row.workspace ? null : row.workspace,
                        )
                      }}
                    />
                  ) : row.kind === 'worker' ? (
                    <span className="text-xs font-bold leading-none text-amber-500 dark:text-amber-400">
                      {row.isLastChild ? '└' : '├'}
                    </span>
                  ) : null}
                </td>
                <td className={`py-1.5 px-1.5 ${row.kind === 'worker' ? 'text-amber-500/50 dark:text-amber-400/40' : 'text-amber-500 dark:text-amber-400'}`}>
                  {task.id.slice(0, 7)}
                </td>
                <td className={`py-1.5 px-1.5 ${H}`}>
                  <span className="text-gray-700 dark:text-gray-300">
                    {task.workspace || 'global'}
                  </span>
                </td>
                <td className="py-1.5 px-1.5 text-gray-900 dark:text-gray-100 truncate max-w-[10rem]">
                  <div className={`flex min-w-0 items-center ${row.kind === 'worker' ? 'pl-2' : ''}`}>
                    {row.kind === 'flat' && task.role === 'lead' ? (
                      <span className="mr-2 shrink-0 text-purple-400">●</span>
                    ) : null}
                    <span className="truncate">{truncate(task.title, 24)}</span>
                    {row.kind === 'lead' && !row.isExpanded && row.childCount > 0 && (
                      <span className="ml-2 shrink-0 rounded-full bg-gray-200/80 px-1.5 py-px text-[10px] font-medium leading-tight text-gray-500 dark:bg-slate-700/60 dark:text-gray-400">
                        {row.childCount}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-1.5 px-1.5">
                  <StatusBadge status={task.status} />
                </td>
                <td className={`py-1.5 px-1.5 ${H}`}>
                  <BackendCell backend={task.backend} />
                </td>
                <td className={`py-1.5 px-1.5 ${H}`}>
                  {task.irc_name ? (
                    <span className="text-gray-700 dark:text-gray-300">
                      {task.irc_name}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-700">&mdash;</span>
                  )}
                </td>
                <td className={`py-1.5 px-1.5 whitespace-normal break-words ${H}`}>
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
      {rows.length === 0 && (
        <div className="py-12 text-center text-gray-400 dark:text-gray-600">
          No tasks yet
        </div>
      )}
    </div>
  )
}
