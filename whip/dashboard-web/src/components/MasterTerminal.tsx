import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { WhipClient } from '../api/client'
import { useVirtualKeys } from '../hooks/useVirtualKeys'
import { VirtualKeyBar } from './VirtualKeyBar'

// bang-shell-profile.terminal palette
const T = {
  bg: '#001A42',
  fg: '#FFB255',
  bold: '#EC9B4B',
  dim: '#7A6840',
  headerBg: '#001233',
  border: '#0E2550',
  inputBg: '#002050',
  inputBorder: '#0E3060',
  selection: '#FFB25530',
  glow: '#FFB25518',
} as const

interface MasterTerminalProps {
  client: WhipClient
  fullscreen?: boolean
  onToggleFullscreen?: () => void
}

export function MasterTerminal({ client, fullscreen, onToggleFullscreen }: MasterTerminalProps) {
  const [alive, setAlive] = useState(false)
  const [available, setAvailable] = useState(true)
  const [sessionName, setSessionName] = useState('whip-master')
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const prevContentRef = useRef<string>('')
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const vk = useVirtualKeys()

  // Initialize xterm.js
  useEffect(() => {
    if (!termRef.current) return
    const term = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      fontSize: 11,
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

    // Mobile touch scroll with momentum
    let touchStartY = 0
    let touchAccum = 0
    let velocity = 0
    let lastMoveTime = 0
    let momentumRaf = 0
    const LINE_HEIGHT = 14
    const FRICTION = 0.96
    const MIN_VELOCITY = 0.2
    const VELOCITY_SMOOTH = 0.4 // EMA smoothing factor
    const el = termRef.current

    const stopMomentum = () => {
      if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0 }
    }

    const startMomentum = () => {
      stopMomentum()
      let accum = 0
      const tick = () => {
        velocity *= FRICTION
        if (Math.abs(velocity) < MIN_VELOCITY) return
        accum += velocity
        const lines = Math.trunc(accum / LINE_HEIGHT)
        if (lines !== 0) {
          term.scrollLines(lines)
          accum -= lines * LINE_HEIGHT
        }
        momentumRaf = requestAnimationFrame(tick)
      }
      momentumRaf = requestAnimationFrame(tick)
    }

    const onTouchStart = (e: TouchEvent) => {
      stopMomentum()
      touchStartY = e.touches[0].clientY
      touchAccum = 0
      velocity = 0
      lastMoveTime = Date.now()
    }
    const onTouchMove = (e: TouchEvent) => {
      const now = Date.now()
      const dy = touchStartY - e.touches[0].clientY
      const dt = Math.max(now - lastMoveTime, 1)
      const instantV = dy / dt * 16
      // Smooth velocity with EMA to avoid jerky momentum starts
      velocity = velocity * (1 - VELOCITY_SMOOTH) + instantV * VELOCITY_SMOOTH
      touchAccum += dy
      touchStartY = e.touches[0].clientY
      lastMoveTime = now
      const lines = Math.trunc(touchAccum / LINE_HEIGHT)
      if (lines !== 0) {
        term.scrollLines(lines)
        touchAccum -= lines * LINE_HEIGHT
      }
      e.preventDefault()
    }
    const onTouchEnd = () => {
      if (Math.abs(velocity) > MIN_VELOCITY) startMomentum()
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      stopMomentum()
      window.removeEventListener('resize', handleResize)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
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
            // Capture scroll position before rewrite
            const buffer = term.buffer.active
            const NEAR_BOTTOM_THRESHOLD = 5
            const wasAtBottom = buffer.baseY - buffer.viewportY <= NEAR_BOTTOM_THRESHOLD
            const savedViewportY = buffer.viewportY // anchor from top

            // Always clear and rewrite to avoid accumulation bugs
            term.reset()
            term.write(content, () => {
              if (wasAtBottom) {
                term.scrollToBottom()
              } else {
                // Restore position anchored from top (not bottom)
                term.scrollToLine(savedViewportY)
              }
            })
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
        const { alive: a, session } = await client.getMasterStatus()
        if (active) {
          setAlive(a)
          setSessionName(session || 'whip-master')
        }
      } catch {
        if (active) setAlive(false)
      }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => { active = false; clearInterval(id) }
  }, [client])

  // Re-fit on fullscreen toggle + reset mobile zoom in fullscreen
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]')
    const original = meta?.getAttribute('content') ?? ''
    if (fullscreen && meta) {
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover')
    }
    const timeout = setTimeout(() => fitAddonRef.current?.fit(), 80)
    return () => {
      clearTimeout(timeout)
      if (fullscreen && meta && original) {
        meta.setAttribute('content', original)
      }
    }
  }, [fullscreen])

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return
    try {
      const keys = vk.applyModifiers(input)
      await client.sendMasterKeys(keys)
      setInput('')
      vk.clearModifiers()
      xtermRef.current?.scrollToBottom()
    } catch { /* ignore */ }
  }, [client, input, vk])

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
            >whip remote</code> for <code
              className="px-2 py-1 rounded font-mono text-xs mx-1"
              style={{ backgroundColor: T.headerBg, color: T.bold, border: `1px solid ${T.border}` }}
            >global</code> or <code
              className="px-2 py-1 rounded font-mono text-xs mx-1"
              style={{ backgroundColor: T.headerBg, color: T.bold, border: `1px solid ${T.border}` }}
            >whip remote --workspace issue-sweep</code> for stacked work
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
          {sessionName}
        </span>
        <span className="font-mono text-[10px] hidden sm:inline" style={{ color: T.dim }}>
          {alive ? 'online' : 'offline'}
        </span>

        <div className="flex-1" />

        {/* Control buttons */}
        <div className="flex items-center gap-0.5">
          {/* Fullscreen toggle */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 -mr-1 rounded-md transition-all active:scale-95"
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
        {/* Virtual key bar */}
        {vk.showKeys && (
          <VirtualKeyBar
            modifiers={vk.modifiers}
            disabled={!alive}
            onToggleModifier={(mod) => { vk.toggleModifier(mod); inputRef.current?.focus() }}
            onSendKey={(key) => { client.sendMasterKeys(key).catch(() => {}); inputRef.current?.focus() }}
          />
        )}
        <div className="flex items-center gap-2">
          {/* Virtual keyboard toggle */}
          <button
            onClick={vk.togglePanel}
            className="p-1.5 rounded transition-all active:scale-95 shrink-0"
            style={{ color: vk.showKeys ? T.bold : T.dim }}
            title="Toggle virtual keys"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="6" y1="8" x2="6" y2="8" /><line x1="10" y1="8" x2="10" y2="8" /><line x1="14" y1="8" x2="14" y2="8" /><line x1="18" y1="8" x2="18" y2="8" />
              <line x1="6" y1="12" x2="6" y2="12" /><line x1="10" y1="12" x2="10" y2="12" /><line x1="14" y1="12" x2="14" y2="12" /><line x1="18" y1="12" x2="18" y2="12" />
              <line x1="8" y1="16" x2="16" y2="16" />
            </svg>
          </button>
          {vk.hasModifier ? (
            <span className="font-mono text-xs select-none shrink-0" style={{ color: T.bold }}>
              {vk.modifierLabel}
            </span>
          ) : (
            <span className="font-mono text-xs select-none shrink-0 hidden sm:block" style={{ color: T.dim }}>$</span>
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
            placeholder={vk.modifierLabel ? `Type a key for ${vk.modifierLabel}...` : 'Send to terminal...'}
            disabled={!alive}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="send"
            inputMode="text"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
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
