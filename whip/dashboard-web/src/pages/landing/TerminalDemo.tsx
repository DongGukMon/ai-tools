import { useEffect, useRef, useState } from 'react'

type NodeStatus = 'idle' | 'created' | 'in_progress' | 'completed'

interface TermLine {
  text: string
  prompt?: boolean
  color?: string
}

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
      <path
        d={`M${NW},${2 + NH / 2} C${130},${2 + NH / 2} ${mergeX},${35} ${mergeX},${mergeY}`}
        fill="none" stroke={lineColor(state.auth)} strokeWidth="1.5"
        style={{ transition: 'stroke 0.5s' }}
      />
      <line
        x1={NW} y1={50 + NH / 2} x2={mergeX} y2={mergeY}
        stroke={lineColor(state.api)} strokeWidth="1.5"
        style={{ transition: 'stroke 0.5s' }}
      />
      <path
        d={`M${NW},${98 + NH / 2} C${130},${98 + NH / 2} ${mergeX},${97} ${mergeX},${mergeY}`}
        fill="none" stroke={lineColor(state.tests)} strokeWidth="1.5"
        style={{ transition: 'stroke 0.5s' }}
      />
      <line
        x1={mergeX} y1={mergeY} x2={220} y2={50 + NH / 2}
        stroke={deployCompleted ? '#8B5CF650' : '#1E293B'} strokeWidth="1.5"
        style={{ transition: 'stroke 0.5s' }}
      />
      <polygon
        points={`${218},${mergeY - 4} ${224},${mergeY} ${218},${mergeY + 4}`}
        fill={deployCompleted ? '#8B5CF650' : '#1E293B'}
        style={{ transition: 'fill 0.5s' }}
      />
      <circle cx={mergeX} cy={mergeY} r="2.5" fill="#334155" style={{ transition: 'fill 0.5s' }} />

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

export function TerminalDemo() {
  const [lines, setLines] = useState<TermLine[]>([])
  const [typingLine, setTypingLine] = useState<string | null>(null)
  const [typingRevealed, setTypingRevealed] = useState(0)
  const [dagState, setDagState] = useState<Record<string, NodeStatus>>({ ...INITIAL_DAG })
  const cancelRef = useRef(false)
  const termRef = useRef<HTMLDivElement>(null)

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
            setDagState(prev => ({ ...prev, ...entry.dag } as Record<string, NodeStatus>))
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
        <div className="mb-8">
          <p className="text-xs font-mono tracking-widest uppercase text-[#8B5CF6] mb-3">Orchestrate</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">Parallel Task Dispatch</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg">Create tasks, wire dependencies, and watch agents work in parallel — with auto-assignment when prerequisites complete.</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-[#0D1526] border-b border-gray-200 dark:border-slate-800">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
            </div>
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-600 ml-2">whip orchestration</span>
          </div>

          <div className="px-6 py-5 sm:py-6 bg-[#FAFBFC] dark:bg-[#060E1F] border-b border-gray-100 dark:border-slate-800/60">
            <DagGraph state={dagState} />
          </div>

          <div
            ref={termRef}
            className="bg-[#FAFBFC] dark:bg-[#060E1F] px-4 sm:px-5 py-4 font-mono text-xs sm:text-[13px] leading-[1.7] overflow-y-auto"
            style={{ height: 260 }}
          >
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2">
                {line.prompt && <span className="text-[#8B5CF6] select-none shrink-0">$</span>}
                <span style={{ color: line.color }} className={!line.color ? (line.prompt ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-500') : undefined}>
                  {line.text}
                </span>
              </div>
            ))}
            {typingLine !== null && (
              <div className="flex gap-2">
                <span className="text-[#8B5CF6] select-none shrink-0">$</span>
                <span className="text-gray-800 dark:text-gray-200">
                  {typingLine.slice(0, typingRevealed)}
                  <span className="inline-block w-[7px] h-[14px] align-text-bottom bg-[#8B5CF6] animate-pulse rounded-sm ml-px" />
                </span>
              </div>
            )}
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
