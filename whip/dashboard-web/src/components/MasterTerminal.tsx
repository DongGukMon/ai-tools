import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { WhipAPIClient } from '../api/client'

// bang-shell-profile.terminal palette
const T = {
  bg: '#00102F',
  fg: '#FFB255',
  bold: '#EC9B4B',
  dim: '#7A6840',
  headerBg: '#000B1F',
  border: '#0A1A3A',
  inputBg: '#001840',
  inputBorder: '#0A2A5A',
  selection: '#FFB25530',
  glow: '#FFB25518',
} as const

interface MasterTerminalProps {
  client: WhipAPIClient
  fullscreen?: boolean
  onToggleFullscreen?: () => void
}

export function MasterTerminal({ client, fullscreen, onToggleFullscreen }: MasterTerminalProps) {
  const [alive, setAlive] = useState(false)
  const [available, setAvailable] = useState(true)
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const prevContentRef = useRef<string>('')
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialize xterm.js
  useEffect(() => {
    if (!termRef.current) return
    const term = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      fontSize: 12,
      lineHeight: 1.1,
      fontFamily: '"SF Mono", SFMono-Regular, Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: T.bg,
        foreground: T.fg,
        cursor: T.fg,
        cursorAccent: T.bg,
        selectionBackground: T.selection,
        selectionForeground: T.fg,
        black: '#0A1628',
        red: '#FF6B6B',
        green: '#4ADE80',
        yellow: T.fg,
        blue: '#60A5FA',
        magenta: '#C084FC',
        cyan: '#22D3EE',
        white: '#E2E8F0',
        brightBlack: '#4A5568',
        brightRed: '#FCA5A5',
        brightGreen: '#86EFAC',
        brightYellow: T.bold,
        brightBlue: '#93C5FD',
        brightMagenta: '#D8B4FE',
        brightCyan: '#67E8F9',
        brightWhite: '#FFFFFF',
      },
      convertEol: true,
      scrollback: 2000,
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
          const term = xtermRef.current
          if (term) {
            const oldContent = prevContentRef.current
            const oldLines = oldContent ? oldContent.split('\n') : []
            const newLines = content.split('\n')

            // Check if user is scrolled to bottom (following output)
            const buffer = term.buffer.active
            const wasAtBottom = buffer.viewportY >= buffer.baseY

            if (oldLines.length === 0) {
              // First write — just render everything
              term.write(content)
            } else {
              // Find overlap: longest suffix of oldLines matching a prefix of newLines
              let overlapLen = 0
              const maxCheck = Math.min(oldLines.length, newLines.length)
              for (let len = maxCheck; len > 0; len--) {
                let match = true
                for (let i = 0; i < len; i++) {
                  if (oldLines[oldLines.length - len + i] !== newLines[i]) {
                    match = false
                    break
                  }
                }
                if (match) {
                  overlapLen = len
                  break
                }
              }

              if (overlapLen > 0) {
                // Append only the new lines after the overlap
                const linesToAdd = newLines.slice(overlapLen)
                if (linesToAdd.length > 0) {
                  term.write('\n' + linesToAdd.join('\n'))
                }
              } else {
                // No overlap found — content changed entirely, must rewrite
                term.clear()
                term.write(content)
              }
            }

            // Preserve scroll position: only auto-scroll if user was at bottom
            if (wasAtBottom) {
              term.scrollToBottom()
            }
          }
          prevContentRef.current = content
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

  // Re-fit on fullscreen toggle
  useEffect(() => {
    const timeout = setTimeout(() => fitAddonRef.current?.fit(), 60)
    return () => clearTimeout(timeout)
  }, [fullscreen])

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return
    try {
      await client.sendMasterKeys(input + '\n')
      setInput('')
    } catch { /* ignore */ }
  }, [client, input])

  // Empty state
  if (!available && !alive) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: `radial-gradient(ellipse at center, #001845 0%, ${T.bg} 70%)` }}>
        <div className="text-center space-y-4 px-6">
          <div className="text-4xl font-mono" style={{ color: T.fg, opacity: 0.15 }}>{'>'}_</div>
          <div className="text-sm font-mono" style={{ color: T.fg, opacity: 0.5 }}>No master session</div>
          <div className="text-xs" style={{ color: T.dim }}>
            Run <code
              className="px-2 py-1 rounded font-mono text-xs mx-1"
              style={{ backgroundColor: T.headerBg, color: T.bold, border: `1px solid ${T.border}` }}
            >whip remote</code> to start
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: T.bg }}>
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-3 sm:px-4 shrink-0"
        style={{
          backgroundColor: T.headerBg,
          borderBottom: `1px solid ${T.border}`,
          height: fullscreen ? 44 : 40,
          paddingTop: fullscreen ? 'env(safe-area-inset-top, 0px)' : undefined,
        }}
      >
        {/* Status dot + label */}
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{
            backgroundColor: alive ? '#4ADE80' : T.dim,
            boxShadow: alive ? '0 0 6px #4ADE8060' : 'none',
          }}
        />
        <span className="font-mono text-xs sm:text-sm truncate" style={{ color: T.fg }}>
          whip-master
        </span>
        <span className="font-mono text-[10px] hidden sm:inline" style={{ color: T.dim }}>
          {alive ? 'online' : 'offline'}
        </span>

        <div className="flex-1" />

        {/* Fullscreen toggle */}
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="p-2 -mr-1 rounded-md transition-all active:scale-95"
            style={{ color: T.dim }}
            title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {fullscreen ? (
                <>
                  <polyline points="6 2 6 6 2 6" /><polyline points="10 14 10 10 14 10" />
                  <polyline points="14 6 10 6 10 2" /><polyline points="2 10 6 10 6 14" />
                </>
              ) : (
                <>
                  <polyline points="2 6 2 2 6 2" /><polyline points="14 10 14 14 10 14" />
                  <polyline points="10 2 14 2 14 6" /><polyline points="6 14 2 14 2 10" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>

      {/* Terminal viewport */}
      <div ref={termRef} className="flex-1 min-h-0 px-1 sm:px-0" style={{ backgroundColor: T.bg }} />

      {/* Input bar */}
      <div
        className="shrink-0 px-2 sm:px-3 py-2"
        style={{
          backgroundColor: T.headerBg,
          borderTop: `1px solid ${T.border}`,
          paddingBottom: fullscreen ? 'max(env(safe-area-inset-bottom, 0px), 8px)' : undefined,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs select-none shrink-0 hidden sm:block" style={{ color: T.dim }}>$</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
            placeholder="Send to terminal..."
            disabled={!alive}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            className="flex-1 min-w-0 rounded-md px-3 py-2 text-sm font-mono transition-colors focus:outline-none disabled:opacity-40"
            style={{
              backgroundColor: T.inputBg,
              border: `1px solid ${T.inputBorder}`,
              color: T.fg,
              caretColor: T.bold,
              WebkitAppearance: 'none',
              fontSize: 16, // prevents iOS zoom
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = T.bold
              e.currentTarget.style.boxShadow = `0 0 0 1px ${T.glow}`
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = T.inputBorder
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!alive || !input.trim()}
            className="shrink-0 px-3 py-2 rounded-md text-xs font-mono font-semibold transition-all active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed"
            style={{ backgroundColor: T.bold, color: T.bg }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="sm:hidden">
              <path d="M2.5 2.1a.5.5 0 0 1 .7-.2l10.5 5.5a.5.5 0 0 1 0 .9L3.2 13.8a.5.5 0 0 1-.7-.5V9l6-1-6-1V2.6a.5.5 0 0 1 0-.5z"/>
            </svg>
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>
    </div>
  )
}
