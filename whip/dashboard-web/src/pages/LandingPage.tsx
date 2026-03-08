import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'

// ── Types & Constants ──────────────────────────────────────────────

type NodeStatus = 'idle' | 'created' | 'in_progress' | 'completed'

interface TermLine { text: string; prompt?: boolean; color?: string }

interface TimelineEntry {
  delay: number
  line?: TermLine & { typing?: boolean }
  dag?: Partial<Record<string, NodeStatus>>
}

const CHAR_SPEED = 20
const RESTART_DELAY = 3500
const INITIAL_DAG: Record<string, NodeStatus> = { auth: 'idle', api: 'idle', tests: 'idle', deploy: 'idle' }

const timeline: TimelineEntry[] = [
  { delay: 600, line: { prompt: true, text: 'whip create "Auth module" --difficulty medium', typing: true } },
  { delay: 250, line: { text: '✓ t-a1 created', color: '#34D399' }, dag: { auth: 'created' } },
  { delay: 350, line: { prompt: true, text: 'whip create "API routes" --difficulty easy', typing: true } },
  { delay: 250, line: { text: '✓ t-b2 created', color: '#34D399' }, dag: { api: 'created' } },
  { delay: 350, line: { prompt: true, text: 'whip create "Tests" --difficulty easy', typing: true } },
  { delay: 250, line: { text: '✓ t-c3 created', color: '#34D399' }, dag: { tests: 'created' } },
  { delay: 350, line: { prompt: true, text: 'whip create "Deploy" --depends-on t-a1,t-b2,t-c3', typing: true } },
  { delay: 250, line: { text: '✓ t-d4 created (blocked by 3 deps)', color: '#34D399' }, dag: { deploy: 'created' } },
  { delay: 500, line: { prompt: true, text: 'whip assign --all', typing: true } },
  { delay: 250, line: { text: '⟳ t-a1 Auth module → in_progress', color: '#A78BFA' }, dag: { auth: 'in_progress' } },
  { delay: 120, line: { text: '⟳ t-b2 API routes → in_progress', color: '#A78BFA' }, dag: { api: 'in_progress' } },
  { delay: 120, line: { text: '⟳ t-c3 Tests → in_progress', color: '#A78BFA' }, dag: { tests: 'in_progress' } },
  { delay: 80, line: { text: '⏸ t-d4 Deploy — waiting for dependencies', color: '#64748B' } },
  { delay: 1400, line: { text: '✓ t-b2 API routes → completed', color: '#34D399' }, dag: { api: 'completed' } },
  { delay: 1100, line: { text: '✓ t-a1 Auth module → completed', color: '#34D399' }, dag: { auth: 'completed' } },
  { delay: 900, line: { text: '✓ t-c3 Tests → completed', color: '#34D399' }, dag: { tests: 'completed' } },
  { delay: 400, line: { text: '⟳ t-d4 Deploy auto-assigned → in_progress', color: '#FBBF24' }, dag: { deploy: 'in_progress' } },
  { delay: 1400, line: { text: '✓ t-d4 Deploy → completed', color: '#34D399' }, dag: { deploy: 'completed' } },
  { delay: 200, line: { text: '' } },
  { delay: 80, line: { text: '  All 4 tasks completed ✓', color: '#34D399' } },
]

// ── DAG Graph ──────────────────────────────────────────────────────

const dagNodes = [
  { id: 'auth', label: 'Auth', x: 0, y: 2 },
  { id: 'api', label: 'API', x: 0, y: 50 },
  { id: 'tests', label: 'Tests', x: 0, y: 98 },
  { id: 'deploy', label: 'Deploy', x: 220, y: 50 },
] as const

const NW = 88
const NH = 30
const R = 6

function nodeColor(s: NodeStatus) {
  switch (s) {
    case 'idle': return { stroke: '#1E293B', fill: 'transparent', text: '#334155' }
    case 'created': return { stroke: '#475569', fill: '#1E293B', text: '#94A3B8' }
    case 'in_progress': return { stroke: '#8B5CF6', fill: '#8B5CF615', text: '#A78BFA' }
    case 'completed': return { stroke: '#34D399', fill: '#34D39912', text: '#34D399' }
  }
}

function lineColor(source: NodeStatus) {
  switch (source) {
    case 'completed': return '#34D39980'
    case 'in_progress': return '#8B5CF650'
    default: return '#1E293B'
  }
}

function DagGraph({ state }: { state: Record<string, NodeStatus> }) {
  const mergeX = 165
  const mergeY = 65
  const deployCompleted = state.deploy === 'completed' || state.deploy === 'in_progress'

  return (
    <svg viewBox="0 0 340 132" className="w-full max-w-xs sm:max-w-sm mx-auto">
      {/* Connection lines */}
      {/* Auth → merge */}
      <path
        d={`M${NW},${2 + NH / 2} C${130},${2 + NH / 2} ${mergeX},${35} ${mergeX},${mergeY}`}
        fill="none" stroke={lineColor(state.auth)} strokeWidth="1.5"
        style={{ transition: 'stroke 0.5s' }}
      />
      {/* API → merge */}
      <line
        x1={NW} y1={50 + NH / 2} x2={mergeX} y2={mergeY}
        stroke={lineColor(state.api)} strokeWidth="1.5"
        style={{ transition: 'stroke 0.5s' }}
      />
      {/* Tests → merge */}
      <path
        d={`M${NW},${98 + NH / 2} C${130},${98 + NH / 2} ${mergeX},${97} ${mergeX},${mergeY}`}
        fill="none" stroke={lineColor(state.tests)} strokeWidth="1.5"
        style={{ transition: 'stroke 0.5s' }}
      />
      {/* Merge → Deploy */}
      <line
        x1={mergeX} y1={mergeY} x2={220} y2={50 + NH / 2}
        stroke={deployCompleted ? '#8B5CF650' : '#1E293B'} strokeWidth="1.5"
        style={{ transition: 'stroke 0.5s' }}
      />
      {/* Arrow head */}
      <polygon
        points={`${218},${mergeY - 4} ${224},${mergeY} ${218},${mergeY + 4}`}
        fill={deployCompleted ? '#8B5CF650' : '#1E293B'}
        style={{ transition: 'fill 0.5s' }}
      />
      {/* Merge dot */}
      <circle cx={mergeX} cy={mergeY} r="2.5" fill="#334155" style={{ transition: 'fill 0.5s' }} />

      {/* Nodes */}
      {dagNodes.map(n => {
        const c = nodeColor(state[n.id])
        return (
          <g key={n.id}>
            <rect
              x={n.x} y={n.y} width={n.id === 'deploy' ? 110 : NW} height={NH} rx={R}
              fill={c.fill} stroke={c.stroke} strokeWidth="1.5"
              style={{ transition: 'fill 0.5s, stroke 0.5s' }}
            />
            {state[n.id] === 'in_progress' && (
              <rect
                x={n.x} y={n.y} width={n.id === 'deploy' ? 110 : NW} height={NH} rx={R}
                fill="none" stroke="#8B5CF6" strokeWidth="1.5" opacity="0.4"
                style={{ filter: 'blur(3px)' }}
              />
            )}
            <text
              x={n.x + (n.id === 'deploy' ? 55 : NW / 2)} y={n.y + NH / 2 + 1}
              textAnchor="middle" dominantBaseline="central"
              fill={c.text} fontSize="11" fontFamily="ui-monospace, monospace" fontWeight="600"
              style={{ transition: 'fill 0.5s' }}
            >
              {n.label}
            </text>
            {state[n.id] === 'completed' && (
              <text
                x={n.x + (n.id === 'deploy' ? 55 : NW / 2) + (n.id === 'deploy' ? 38 : 30)}
                y={n.y + NH / 2 + 1}
                textAnchor="middle" dominantBaseline="central"
                fill="#34D399" fontSize="10"
              >
                ✓
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Terminal Demo ──────────────────────────────────────────────────

function TerminalDemo() {
  const [lines, setLines] = useState<TermLine[]>([])
  const [typingLine, setTypingLine] = useState<string | null>(null)
  const [typingRevealed, setTypingRevealed] = useState(0)
  const [dagState, setDagState] = useState<Record<string, NodeStatus>>({ ...INITIAL_DAG })
  const cancelRef = useRef(false)
  const termRef = useRef<HTMLDivElement>(null)

  // Auto-scroll terminal
  useEffect(() => {
    const el = termRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, typingRevealed])

  useEffect(() => {
    cancelRef.current = false

    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
    const done = () => cancelRef.current

    const run = async () => {
      while (!done()) {
        // Reset
        setLines([])
        setTypingLine(null)
        setTypingRevealed(0)
        setDagState({ ...INITIAL_DAG })
        await sleep(800)

        for (const entry of timeline) {
          if (done()) return
          await sleep(entry.delay)
          if (done()) return

          if (entry.dag) {
            const dagUpdate = entry.dag
            setDagState(prev => ({ ...prev, ...dagUpdate } as Record<string, NodeStatus>))
          }

          if (entry.line) {
            if (entry.line.typing) {
              const text = entry.line.text
              setTypingLine(text)
              setTypingRevealed(0)
              for (let i = 1; i <= text.length; i++) {
                if (done()) return
                setTypingRevealed(i)
                await sleep(CHAR_SPEED)
              }
              await sleep(180)
              if (done()) return
              setTypingLine(null)
              setLines(prev => [...prev, { text, prompt: true }])
            } else {
              setLines(prev => [...prev, { text: entry.line!.text, color: entry.line!.color }])
            }
          }
        }

        if (done()) return
        await sleep(RESTART_DELAY)
      }
    }

    run()
    return () => { cancelRef.current = true }
  }, [])

  return (
    <section className="px-6 pb-20 sm:pb-28">
      <div className="max-w-5xl mx-auto">
        <div className="rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-none">
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-[#0D1526] border-b border-gray-200 dark:border-slate-800">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
            </div>
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-600 ml-2">whip orchestration</span>
          </div>

          {/* DAG graph */}
          <div className="px-6 py-5 sm:py-6 bg-[#FAFBFC] dark:bg-[#060E1F] border-b border-gray-100 dark:border-slate-800/60">
            <DagGraph state={dagState} />
          </div>

          {/* Terminal output */}
          <div
            ref={termRef}
            className="bg-[#FAFBFC] dark:bg-[#060E1F] px-4 sm:px-5 py-4 font-mono text-xs sm:text-[13px] leading-[1.7] overflow-y-auto"
            style={{ maxHeight: 260 }}
          >
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2">
                {line.prompt && <span className="text-[#8B5CF6] select-none shrink-0">$</span>}
                <span style={{ color: line.color }} className={!line.color ? (line.prompt ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-500') : undefined}>
                  {line.text}
                </span>
              </div>
            ))}
            {/* Typing line */}
            {typingLine !== null && (
              <div className="flex gap-2">
                <span className="text-[#8B5CF6] select-none shrink-0">$</span>
                <span className="text-gray-800 dark:text-gray-200">
                  {typingLine.slice(0, typingRevealed)}
                  <span className="inline-block w-[7px] h-[14px] align-text-bottom bg-[#8B5CF6] animate-pulse rounded-sm ml-px" />
                </span>
              </div>
            )}
            {/* Idle cursor */}
            {typingLine === null && (
              <div className="flex gap-2 mt-0.5">
                <span className="text-[#8B5CF6] select-none shrink-0">$</span>
                <span className="inline-block w-[7px] h-[14px] align-text-bottom bg-[#8B5CF6] animate-pulse rounded-sm" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Features ───────────────────────────────────────────────────────

const features = [
  {
    label: 'Parallel Dispatch',
    desc: 'Split work across multiple Claude sessions. Each runs in its own tmux pane with full context.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M21 3l-7 7" /><path d="M3 3l7 7" />
        <path d="M16 21h5v-5" /><path d="M8 21H3v-5" /><path d="M21 21l-7-7" /><path d="M3 21l7-7" />
      </svg>
    ),
  },
  {
    label: 'IRC Coordination',
    desc: 'Agents communicate through claude-irc. Publish topics, share contracts, sync on blockers.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        <path d="M8 9h8" /><path d="M8 13h5" />
      </svg>
    ),
  },
  {
    label: 'Live Terminal',
    desc: 'Stream the master session output in real-time. Send keystrokes directly from the browser.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    label: 'Web Dashboard',
    desc: 'Monitor tasks, chat with agents, view progress — all from a single browser tab.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
]

// ── Landing Page ───────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 transition-colors">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-white/80 dark:bg-[#0B1120]/80 border-b border-gray-200/50 dark:border-slate-800/50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="bg-[#8B5CF6] text-white text-[10px] font-bold tracking-wider px-2 py-0.5 rounded font-mono">WHIP</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/login"
              className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[#8B5CF6] text-white hover:bg-[#7C3AED] transition-colors"
            >
              Connect
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl">
            <p className="text-xs font-mono tracking-widest uppercase text-[#8B5CF6] mb-4">Task Orchestrator for AI Agents</p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] text-gray-900 dark:text-white mb-5">
              One lead.<br />
              <span className="text-gray-400 dark:text-gray-500">Many agents.</span><br />
              Ship faster.
            </h1>
            <p className="text-base sm:text-lg text-gray-500 dark:text-gray-400 leading-relaxed max-w-lg mb-8">
              Split complex tasks across parallel Claude sessions. Wire dependencies. Watch them converge.
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#8B5CF6] text-white hover:bg-[#7C3AED] transition-colors"
              >
                Connect to Dashboard
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8h10" /><path d="M9 4l4 4-4 4" />
                </svg>
              </Link>
              <span className="text-xs font-mono text-gray-400 dark:text-gray-600 hidden sm:block">
                or&ensp;<code className="px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-slate-700">whip remote</code>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Animated terminal demo */}
      <TerminalDemo />

      {/* Features */}
      <section className="px-6 pb-20 sm:pb-28">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-mono tracking-widest uppercase text-gray-400 dark:text-gray-600 mb-8">How it works</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {features.map(f => (
              <div
                key={f.label}
                className="group p-5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#0D1526] hover:border-[#8B5CF6]/30 dark:hover:border-[#8B5CF6]/20 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-[#8B5CF6] mb-3 group-hover:bg-[#8B5CF6]/10 dark:group-hover:bg-[#8B5CF6]/10 transition-colors">
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{f.label}</h3>
                <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick start */}
      <section className="px-6 pb-20 sm:pb-28">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-mono tracking-widest uppercase text-gray-400 dark:text-gray-600 mb-8">Quick start</p>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Install', code: 'curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/whip/install.sh | bash' },
              { step: '02', title: 'Start remote', code: 'whip remote --tunnel your-domain.com' },
              { step: '03', title: 'Connect', code: 'Open the generated dashboard URL' },
            ].map(s => (
              <div key={s.step}>
                <span className="text-[10px] font-mono text-[#8B5CF6] tracking-widest">{s.step}</span>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mt-1 mb-2">{s.title}</h4>
                <code className="block px-3 py-2 rounded-lg bg-gray-100 dark:bg-[#0D1526] border border-gray-200 dark:border-slate-800 text-xs font-mono text-gray-600 dark:text-gray-400">
                  {s.code}
                </code>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold tracking-wider text-gray-400 dark:text-gray-600">WHIP</span>
            <span className="text-[10px] text-gray-300 dark:text-gray-700">·</span>
            <span className="text-[10px] text-gray-400 dark:text-gray-600">AI Task Orchestrator</span>
          </div>
          <a
            href="https://github.com/bang9/ai-tools"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
        </div>
      </footer>
    </div>
  )
}
