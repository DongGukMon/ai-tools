import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Task, Peer, Message } from '../api/types'
import { AuthError, ConnectionError } from '../api/client'
import { getClient, clearAuth } from '../stores/auth'
import { useTasks } from '../hooks/useTasks'
import { useConnectionStatus, getBackoffInterval } from '../hooks/useConnectionStatus'
import { TaskTable } from '../components/TaskTable'
import { TaskDetail } from '../components/TaskDetail'
import { SummaryStats } from '../components/SummaryStats'
import { PeerList, sortPeers } from '../components/PeerList'
import { Chat, type ChatMessage } from '../components/Chat'
import { MasterTerminal } from '../components/MasterTerminal'
import { Seo } from '../components/Seo'

type Tab = 'tasks' | 'chat' | 'terminal'

interface SentMessage {
  to: string
  content: string
  timestamp: string
}

interface Props {
  onDisconnect: () => void
}

export function DashboardPage({ onDisconnect }: Props) {
  const client = useMemo(() => getClient(), [])
  const [activeTab, setActiveTab] = useState<Tab>('tasks')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [terminalFullscreen, setTerminalFullscreen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)

  // Esc key to exit fullscreen
  useEffect(() => {
    if (!terminalFullscreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTerminalFullscreen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [terminalFullscreen])

  // IRC state
  const [peers, setPeers] = useState<Peer[]>([])
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null)
  const [inboxMessages, setInboxMessages] = useState<Message[]>([])
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([])
  const [sending, setSending] = useState(false)

  const handleLogout = useCallback(() => {
    clearAuth()
    onDisconnect()
  }, [onDisconnect])

  const connectionStatus = useConnectionStatus(handleLogout)
  const pollInterval = connectionStatus.status === 'reconnecting'
    ? getBackoffInterval(connectionStatus.retryCount)
    : 2000

  const { tasks, error } = useTasks(client, {
    onAuthError: connectionStatus.onAuthError,
    onConnectionError: connectionStatus.onConnectionError,
    onConnectionSuccess: connectionStatus.onConnectionSuccess,
  }, pollInterval)
  const sortedPeers = useMemo(() => sortPeers(peers), [peers])

  // Keep selected task in sync with latest data
  const currentSelected = selectedTask
    ? tasks.find(t => t.id === selectedTask.id) ?? null
    : null


  // Stable refs for connection callbacks to avoid effect restarts
  const onConnectionSuccessRef = useRef(connectionStatus.onConnectionSuccess)
  onConnectionSuccessRef.current = connectionStatus.onConnectionSuccess
  const onConnectionErrorRef = useRef(connectionStatus.onConnectionError)
  onConnectionErrorRef.current = connectionStatus.onConnectionError
  const onAuthErrorRef = useRef(connectionStatus.onAuthError)
  onAuthErrorRef.current = connectionStatus.onAuthError

  // Poll peers
  useEffect(() => {
    if (!client) return
    const controller = new AbortController()
    let intervalId: ReturnType<typeof setInterval> | undefined

    const poll = () => {
      if (document.visibilityState === 'hidden') return
      client.getPeers(controller.signal).then(p => {
        if (!controller.signal.aborted) {
          setPeers(p)
          onConnectionSuccessRef.current()
        }
      }).catch(err => {
        if (controller.signal.aborted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof AuthError) onAuthErrorRef.current()
        else if (err instanceof ConnectionError) onConnectionErrorRef.current()
      })
    }
    poll()
    intervalId = setInterval(poll, pollInterval)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      controller.abort()
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [client, pollInterval])

  // Poll inbox
  useEffect(() => {
    if (!client) return
    const controller = new AbortController()
    let intervalId: ReturnType<typeof setInterval> | undefined

    const poll = () => {
      if (document.visibilityState === 'hidden') return
      client.getInbox('user', true, controller.signal).then(m => {
        if (!controller.signal.aborted) {
          setInboxMessages(m)
          onConnectionSuccessRef.current()
        }
      }).catch(err => {
        if (controller.signal.aborted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof AuthError) onAuthErrorRef.current()
        else if (err instanceof ConnectionError) onConnectionErrorRef.current()
      })
    }
    poll()
    intervalId = setInterval(poll, pollInterval)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      controller.abort()
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [client, pollInterval])

  useEffect(() => {
    if (sortedPeers.length === 0) {
      if (selectedPeer !== null) {
        setSelectedPeer(null)
      }
      return
    }

    if (selectedPeer && sortedPeers.some(peer => peer.name === selectedPeer)) {
      return
    }

    setSelectedPeer(sortedPeers[0].name)
  }, [selectedPeer, sortedPeers])

  // Mark messages as read when viewing a peer's chat
  useEffect(() => {
    if (!client || !selectedPeer || activeTab !== 'chat') return
    const hasUnread = inboxMessages.some(m => m.from === selectedPeer && !m.read)
    if (hasUnread) {
      client.markRead('user').catch(() => {})
    }
  }, [activeTab, client, selectedPeer, inboxMessages])

  // Unread counts per peer
  const unreadCounts: Record<string, number> = {}
  for (const msg of inboxMessages) {
    if (msg.from !== 'user' && !msg.read) {
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
  const chatMessages = useMemo<ChatMessage[]>(() => {
    if (!selectedPeer) {
      return []
    }

    return [
      ...inboxMessages
        .filter(m => m.from === selectedPeer)
        .map(m => ({ from: m.from, content: m.content, timestamp: m.timestamp, direction: 'received' as const })),
      ...sentMessages
        .filter(m => m.to === selectedPeer)
        .map(m => ({ from: 'user', content: m.content, timestamp: m.timestamp, direction: 'sent' as const })),
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [inboxMessages, selectedPeer, sentMessages])

  const selectedPeerInfo = useMemo(
    () => sortedPeers.find(peer => peer.name === selectedPeer) ?? null,
    [selectedPeer, sortedPeers],
  )

  useEffect(() => {
    if (!client) onDisconnect()
  }, [client, onDisconnect])

  if (!client) return null

  return (
    <>
      <Seo
        title="Connected whip dashboard"
        description="Monitor tasks, peers, chat, and the lead terminal in a running whip remote session."
        path="/dashboard"
        noindex
      />
      <div>
      {/* Reconnecting banner */}
      {connectionStatus.status === 'reconnecting' && (
        <div className="mb-3 px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm text-amber-700 dark:text-amber-400">
            Reconnecting… (attempt {connectionStatus.retryCount})
          </span>
        </div>
      )}

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
          onClick={() => setActiveTab('chat')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'chat'
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'terminal'
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Terminal
        </button>
        <div className="flex-1" />
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-md text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Disconnect
        </button>
      </div>

      {activeTab === 'tasks' && (
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
      )}

      {activeTab === 'chat' && (
        <div className="flex gap-0 h-[calc(100vh-10rem)] rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-[#0F172A]">
          {/* Peer list: visible on desktop always, on mobile only when chat not open */}
          <div className={`${mobileChatOpen ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-auto`}>
            <PeerList
              peers={sortedPeers}
              selectedPeer={selectedPeer}
              unreadCounts={unreadCounts}
              onSelectPeer={(name) => {
                setSelectedPeer(name)
                setMobileChatOpen(true)
              }}
            />
          </div>
          {/* Chat area: visible on desktop always, on mobile only when chat is open */}
          <div className={`${mobileChatOpen ? 'flex' : 'hidden md:flex'} flex-1 flex-col gap-3 p-3 min-w-0 bg-gray-50 dark:bg-[#0B1120]`}>
            <Chat
              peer={selectedPeerInfo}
              messages={chatMessages}
              onSend={handleSend}
              sending={sending}
              onBack={() => setMobileChatOpen(false)}
            />
          </div>
        </div>
      )}

      {activeTab === 'terminal' && !terminalFullscreen && (
        <div className="h-[calc(100vh-10rem)] rounded-xl border border-[#0E2550] overflow-hidden" style={{ backgroundColor: '#001A42' }}>
          <MasterTerminal client={client} fullscreen={false} onToggleFullscreen={() => setTerminalFullscreen(true)} />
        </div>
      )}
      {activeTab === 'terminal' && terminalFullscreen && (
        <div className="fixed inset-0 z-50" style={{ backgroundColor: '#001A42' }}>
          <MasterTerminal client={client} fullscreen={true} onToggleFullscreen={() => setTerminalFullscreen(false)} />
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
    </>
  )
}
