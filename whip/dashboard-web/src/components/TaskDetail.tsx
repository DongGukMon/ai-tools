import type { Task } from '../api/types'
import { StatusBadge } from './StatusBadge'

interface TaskDetailProps {
  task: Task
  onClose: () => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="w-32 shrink-0 font-bold text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <span className="text-gray-900 dark:text-gray-100 min-w-0">{children}</span>
    </div>
  )
}

function BackendValue({ backend }: { backend: string }) {
  switch (backend) {
    case 'claude':
      return <span className="text-purple-400 dark:text-purple-300">claude</span>
    case 'codex':
      return <span className="text-emerald-500 dark:text-emerald-400">codex</span>
    default:
      return <span className="text-gray-400 dark:text-gray-600">&mdash;</span>
  }
}

function RunnerValue({ runner }: { runner: string }) {
  switch (runner) {
    case 'tmux':
      return <span className="text-indigo-500 dark:text-indigo-400">tmux</span>
    case 'terminal':
      return <span className="text-amber-500 dark:text-amber-400">terminal</span>
    default:
      return <span className="text-gray-400 dark:text-gray-600">&mdash;</span>
  }
}

function PidValue({ pid, alive, status }: { pid: number; alive: boolean; status: Task['status'] }) {
  if (pid <= 0) return <span className="text-gray-400 dark:text-gray-600">&mdash;</span>
  if (alive) return <span className="text-emerald-500 dark:text-emerald-400">● {pid}</span>
  if (status === 'completed') return <span className="text-amber-500 dark:text-amber-400">- {pid}</span>
  return <span className="text-red-500 dark:text-red-400">✗ {pid}</span>
}

function formatTime(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleString()
}

export function TaskDetail({ task, onClose }: TaskDetailProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 dark:bg-black/50"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0F172A] border-l border-gray-200 dark:border-gray-700 overflow-y-auto shadow-xl">
        <div className="p-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm mb-6">
            <button
              onClick={onClose}
              className="text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Tasks
            </button>
            <span className="text-gray-400 dark:text-gray-700">&rsaquo;</span>
            <span className="text-purple-400 dark:text-purple-300 font-bold">
              {task.title}
            </span>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Fields */}
          <div className="space-y-0 font-mono text-sm">
            <Field label="ID">
              <span className="text-amber-500 dark:text-amber-400">{task.id}</span>
            </Field>
            <Field label="Title">{task.title}</Field>
            <Field label="Status"><StatusBadge status={task.status} /></Field>
            <Field label="Backend"><BackendValue backend={task.backend} /></Field>
            <Field label="Difficulty">
              {task.difficulty || 'default'}
            </Field>
            <Field label="Review">
              {String(task.review)}
            </Field>
            <Field label="Runner"><RunnerValue runner={task.runner} /></Field>
            {task.irc_name && <Field label="IRC">{task.irc_name}</Field>}
            {task.master_irc_name && <Field label="Master IRC">{task.master_irc_name}</Field>}
            {task.shell_pid > 0 && (
              <Field label="Shell PID">
                <PidValue pid={task.shell_pid} alive={task.pid_alive} status={task.status} />
              </Field>
            )}
            {task.note && (
              <Field label="Note">
                <span className="text-gray-500 dark:text-gray-400">{task.note}</span>
              </Field>
            )}
            {task.depends_on && task.depends_on.length > 0 && (
              <Field label="Depends On">
                <span className="text-amber-500 dark:text-amber-400">
                  {task.depends_on.join(', ')}
                </span>
              </Field>
            )}
            {task.cwd && (
              <Field label="CWD">
                <span className="text-gray-500 dark:text-gray-500 break-all">{task.cwd}</span>
              </Field>
            )}
            <Field label="Created">
              <span className="text-gray-500 dark:text-gray-500">{formatTime(task.created_at)}</span>
            </Field>
            <Field label="Updated">
              <span className="text-gray-500 dark:text-gray-500">{formatTime(task.updated_at)}</span>
            </Field>
            {task.assigned_at && (
              <Field label="Assigned">
                <span className="text-gray-500 dark:text-gray-500">{formatTime(task.assigned_at)}</span>
              </Field>
            )}
            {task.completed_at && (
              <Field label="Completed">
                <span className="text-gray-500 dark:text-gray-500">{formatTime(task.completed_at)}</span>
              </Field>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <div className="mt-6">
              <div className="font-bold text-purple-400 dark:text-purple-300 text-sm mb-2">
                Description
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <pre className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed max-h-[50vh] overflow-y-auto">
                  {task.description}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
