import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '../api/types'
import { getClient, clearAuth } from '../stores/auth'
import { useTasks } from '../hooks/useTasks'
import { TaskTable } from '../components/TaskTable'
import { TaskDetail } from '../components/TaskDetail'
import { SummaryStats } from '../components/SummaryStats'

type Tab = 'tasks' | 'irc'

export function DashboardPage() {
  const navigate = useNavigate()
  const client = useMemo(() => getClient(), [])
  const [activeTab, setActiveTab] = useState<Tab>('tasks')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const handleAuthError = useCallback(() => {
    clearAuth()
    navigate('/')
  }, [navigate])

  const { tasks, error } = useTasks(client, handleAuthError)

  // Keep selected task in sync with latest data
  const currentSelected = selectedTask
    ? tasks.find(t => t.id === selectedTask.id) ?? null
    : null

  const handleDisconnect = () => {
    clearAuth()
    navigate('/')
  }

  if (!client) {
    navigate('/')
    return null
  }

  return (
    <div>
      {/* Tab navigation */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'tasks'
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Tasks
        </button>
        <button
          onClick={() => setActiveTab('irc')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'irc'
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          IRC
        </button>
        <div className="flex-1" />
        <button
          onClick={handleDisconnect}
          className="px-3 py-1.5 rounded-md text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Disconnect
        </button>
      </div>

      {activeTab === 'tasks' ? (
        <div>
          {/* Summary stats */}
          <div className="mb-4">
            <SummaryStats tasks={tasks} />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Task table */}
          <TaskTable
            tasks={tasks}
            selectedId={currentSelected?.id ?? null}
            onSelect={setSelectedTask}
          />

          {/* Auto-refresh indicator */}
          <div className="mt-3 text-xs text-gray-400 dark:text-gray-600">
            &#8635; 2s auto-refreshing
          </div>
        </div>
      ) : (
        <div className="py-12 text-center text-gray-400 dark:text-gray-600">
          IRC view coming soon.
        </div>
      )}

      {/* Task detail slide-out */}
      {currentSelected && (
        <TaskDetail
          task={currentSelected}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  )
}
