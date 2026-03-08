import { useState, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { WhipAPIClient } from '../api/client'

interface MasterTerminalProps {
  client: WhipAPIClient
}

export function MasterTerminal({ client }: MasterTerminalProps) {
  const [alive, setAlive] = useState(false)
  const [available, setAvailable] = useState(true)
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const prevContentRef = useRef<string>('')
  const [input, setInput] = useState('')

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!termRef.current) return
    const term = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, monospace',
      theme: { background: '#0B1120', foreground: '#e2e8f0' },
      convertEol: true,
      scrollback: 1000,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(termRef.current)
    fitAddon.fit()
    xtermRef.current = term
    fitAddonRef.current = fitAddon

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  // Poll capture every 1s
  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const { content } = await client.getMasterCapture()
        if (active && content !== prevContentRef.current) {
          prevContentRef.current = content
          const term = xtermRef.current
          if (term) {
            term.clear()
            term.write(content)
          }
        }
        if (active) setAvailable(true)
      } catch {
        if (active) setAvailable(false)
      }
    }
    poll()
    const id = setInterval(poll, 1000)
    return () => { active = false; clearInterval(id) }
  }, [client])

  // Poll status every 5s
  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const { alive: a } = await client.getMasterStatus()
        if (active) setAlive(a)
      } catch {
        if (active) setAlive(false)
      }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => { active = false; clearInterval(id) }
  }, [client])

  const handleSubmit = async () => {
    if (!input.trim()) return
    try {
      await client.sendMasterKeys(input + '\n')
      setInput('')
    } catch { /* ignore */ }
  }

  if (!available && !alive) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
        <div className="text-center space-y-3">
          <div className="text-3xl opacity-40">&#9618;</div>
          <div className="text-sm">Master session not running.</div>
          <div className="text-xs text-gray-400 dark:text-gray-600">
            Start with <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-xs font-mono">whip remote</code> to enable.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-sm font-mono">
        <span className={alive ? 'text-emerald-500' : 'text-gray-400 dark:text-gray-600'}>
          {alive ? '\u25CF' : '\u25CB'}
        </span>
        <span className="text-gray-700 dark:text-gray-300">whip-master</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {alive ? 'online' : 'offline'}
        </span>
      </div>

      {/* Terminal */}
      <div ref={termRef} className="flex-1 min-h-0 bg-[#0B1120]" />

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 dark:text-gray-600 text-sm font-mono select-none">&#10095;</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Type command and press Enter..."
            disabled={!alive}
            className="flex-1 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/50 focus:border-[#8B5CF6] disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleSubmit}
            disabled={!alive || !input.trim()}
            className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-[#8B5CF6] text-white hover:bg-[#7C3AED] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
