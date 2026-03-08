import { useState, useEffect, useRef } from 'react'
import type { Peer } from '../api/types'
import { timeAgo } from '../lib/format'

export interface ChatMessage {
  from: string
  content: string
  timestamp: string
  direction: 'sent' | 'received'
}

interface ChatProps {
  peer: Peer | null
  messages: ChatMessage[]
  onSend: (content: string) => Promise<void>
  sending: boolean
}

export function Chat({ peer, messages, onSend, sending }: ChatProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    await onSend(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  if (!peer) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-[#1E293B]">
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          Select a peer to start chatting
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-3 shrink-0">
        <span className={`text-xs ${peer.online ? 'text-emerald-500' : 'text-gray-400'}`}>
          {peer.online ? '\u25CF' : '\u25CB'}
        </span>
        <span className="font-medium text-gray-900 dark:text-gray-100">{peer.name}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {peer.online ? 'online' : 'offline'}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-1 sm:px-4 py-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
            No messages yet. Send a message to start the conversation.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={`${msg.timestamp}-${i}`}
            className={`flex ${msg.direction === 'sent' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                msg.direction === 'sent'
                  ? 'bg-[#8B5CF6] text-white rounded-br-md'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-gray-100 rounded-bl-md'
              }`}
            >
              {msg.direction === 'received' && (
                <p className="text-xs font-medium text-[#8B5CF6] dark:text-[#A78BFA] mb-1">
                  {msg.from}
                </p>
              )}
              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
              <p
                className={`text-[10px] mt-1 ${
                  msg.direction === 'sent'
                    ? 'text-white/60'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
                title={new Date(msg.timestamp).toLocaleString()}
              >
                {timeAgo(msg.timestamp)}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/50 focus:border-[#8B5CF6] disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-[#8B5CF6] text-white hover:bg-[#7C3AED] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95l14.095-5.378a.75.75 0 0 0 0-1.396L3.105 2.289Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
