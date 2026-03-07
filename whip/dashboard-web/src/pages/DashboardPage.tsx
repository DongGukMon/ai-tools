import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task, Peer, Message } from '../api/types'
import { AuthError, ConnectionError } from '../api/client'
import { getClient, clearAuth } from '../stores/auth'
import { useTasks } from '../hooks/useTasks'
import { TaskTable } from '../components/TaskTable'
import { TaskDetail } from '../components/TaskDetail'
import { SummaryStats } from '../components/SummaryStats'
import { PeerList } from '../components/PeerList'
import { Chat, type ChatMessage } from '../components/Chat'
import { TopicBoard } from '../components/TopicBoard'

type Tab = 'tasks' | 'irc'

interface SentMessage {
  to: string
  content: string
  timestamp: string
}

export function DashboardPage() {
  const navigate = useNavigate()
  const client = useMemo(() => getClient(), [])
  const [activeTab, setActiveTab] = useState<Tab>('tasks')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // IRC state
  const [peers, setPeers] = useState<Peer[]>([])
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null)
  const [inboxMessages, setInboxMessages] = useState<Message[]>([])
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([])
  const [sending, setSending] = useState(false)

  const handleDisconnected = useCallback(() => {
    clearAuth()
    navigate('/')
  }, [navigate])

  const { tasks, error } = useTasks(client, handleDisconnected)

  // Keep selected task in sync with latest data
  const currentSelected = selectedTask
    ? tasks.find(t => t.id === selectedTask.id) ?? null
    : null


  // Poll peers every 2s
  useEffect(() => {
    if (!client) return
    let active = true
    const poll = () => {
      client.getPeers().then(p => { if (active) setPeers(p) }).catch(err => {
        if (err instanceof AuthError || err instanceof ConnectionError) handleDisconnected()
      })
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => { active = false; clearInterval(id) }
  }, [client, handleDisconnected])

  // Poll inbox every 2s
  useEffect(() => {
    if (!client) return
    let active = true
    const poll = () => {
      client.getInbox('user', true).then(m => { if (active) setInboxMessages(m) }).catch(() => {})
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => { active = false; clearInterval(id) }
  }, [client])

  // Mark messages as read when viewing a peer's chat
  useEffect(() => {
    if (!client || !selectedPeer) return
    const hasUnread = inboxMessages.some(m => m.from === selectedPeer && !m.read)
    if (hasUnread) {
      client.markRead('user').catch(() => {})
    }
  }, [client, selectedPeer, inboxMessages])

  // Unread counts per peer
  const unreadCounts: Record<string, number> = {}
  for (const msg of inboxMessages) {
    if (!msg.read) {
      unreadCounts[msg.from] = (unreadCounts[msg.from] || 0) + 1
    }
  }

  // Send message handler
  const handleSend = useCallback(async (content: string) => {
    if (!client || !selectedPeer) return
    setSending(true)
    try {
      await client.sendMessage(selectedPeer, content)
      setSentMessages(prev => [...prev, {
        to: selectedPeer,
        content,
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setSending(false)
    }
  }, [client, selectedPeer])

  // Merge sent + received for selected peer
  const chatMessages: ChatMessage[] = selectedPeer
    ? [
        ...inboxMessages
          .filter(m => m.from === selectedPeer)
          .map(m => ({ from: m.from, content: m.content, timestamp: m.timestamp, direction: 'received' as const })),
        ...sentMessages
          .filter(m => m.to === selectedPeer)
          .map(m => ({ from: 'user', content: m.content, timestamp: m.timestamp, direction: 'sent' as const })),
      ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    : []

  const selectedPeerInfo = peers.find(p => p.name === selectedPeer) ?? null

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
          onClick={handleDisconnected}
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
        <div className="flex gap-0 h-[calc(100vh-10rem)] rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-[#0F172A]">
          <PeerList
            peers={peers}
            selectedPeer={selectedPeer}
            unreadCounts={unreadCounts}
            onSelectPeer={setSelectedPeer}
          />
          <div className="flex-1 flex flex-col gap-3 p-3 min-w-0 bg-gray-50 dark:bg-[#0B1120]">
            <Chat
              peer={selectedPeerInfo}
              messages={chatMessages}
              onSend={handleSend}
              sending={sending}
            />
            {selectedPeer && client && (
              <TopicBoard client={client} peerName={selectedPeer} />
            )}
          </div>
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
