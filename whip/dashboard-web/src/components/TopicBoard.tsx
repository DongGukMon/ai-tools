import { useState, useEffect } from 'react'
import type { WhipAPIClient } from '../api/client'
import type { Topic } from '../api/types'

interface TopicBoardProps {
  client: WhipAPIClient
  peerName: string
}

export function TopicBoard({ client, peerName }: TopicBoardProps) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setTopics([])
    setExpanded(null)
    setLoading(true)
    client
      .getTopics(peerName)
      .then(setTopics)
      .catch(() => setTopics([]))
      .finally(() => setLoading(false))
  }, [client, peerName])

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-4 py-3">
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading topics...</p>
      </div>
    )
  }

  if (topics.length === 0) return null

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] shrink-0 max-h-64 flex flex-col">
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-slate-700 shrink-0">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Topics ({topics.length})
        </h3>
      </div>
      <div className="overflow-y-auto">
        {topics.map((topic, i) => (
          <div key={i} className="border-b border-gray-100 dark:border-slate-700/50 last:border-b-0">
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-4 h-4 text-gray-400 transition-transform ${expanded === i ? 'rotate-90' : ''}`}
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {topic.title}
              </span>
            </button>
            {expanded === i && (
              <div className="px-4 pb-3 pl-10">
                <pre className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words font-mono bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
                  {topic.content}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
