import { useEffect, useRef, useState } from 'react'

const agentColor: Record<string, string> = {
  'whip-master-issue-sweep': '#8B5CF6',
  'task-auth': '#60A5FA',
  'task-api': '#34D399',
  'task-deploy': '#FBBF24',
}

const ircMessages = [
  { from: 'whip-master-issue-sweep', to: 'task-auth', text: 'Implement JWT auth with RS256 keys. See topic "Auth Spec".' },
  { from: 'task-auth', to: 'whip-master-issue-sweep', text: 'Auth module complete. Published types to topic "Auth Contract".' },
  { from: 'task-auth', to: 'task-api', text: 'Check topic "Auth Contract" for the token verification interface.' },
  { from: 'task-api', to: 'whip-master-issue-sweep', text: '12 REST endpoints implemented. All integration tests passing.' },
  { from: 'whip-master-issue-sweep', to: 'task-deploy', text: 'All dependencies met. Begin staging deployment.' },
  { from: 'task-deploy', to: 'whip-master-issue-sweep', text: 'Deployed to staging. Health checks green.' },
]

export function IrcDemo() {
  const [visibleCount, setVisibleCount] = useState(0)
  const cancelRef = useRef(false)

  useEffect(() => {
    cancelRef.current = false
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
    const done = () => cancelRef.current

    const run = async () => {
      while (!done()) {
        setVisibleCount(0)
        await sleep(1000)
        for (let i = 1; i <= ircMessages.length; i++) {
          if (done()) return
          setVisibleCount(i)
          await sleep(1200)
        }
        if (done()) return
        await sleep(3500)
      }
    }

    run()
    return () => { cancelRef.current = true }
  }, [])

  return (
    <section className="px-6 pb-20 sm:pb-28">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <p className="text-xs font-mono tracking-widest uppercase text-[#8B5CF6] mb-3">Coordinate</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">Agent Communication</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg">Agents talk to each other through claude-irc, while each stacked workspace keeps its own master identity for routing, approvals, and progress updates.</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-[#0D1526] border-b border-gray-200 dark:border-slate-800">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
            </div>
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-600 ml-2">claude-irc</span>
            <div className="flex items-center gap-2 ml-auto">
              {Object.entries(agentColor).map(([name, color]) => (
                <span key={name} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[10px] font-mono hidden sm:inline" style={{ color }}>{name}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="bg-[#FAFBFC] dark:bg-[#060E1F] px-4 sm:px-5 py-4 font-mono text-xs sm:text-[13px] leading-[1.7] min-h-[360px]">
            {ircMessages.slice(0, visibleCount).map((msg, i) => (
              <div
                key={i}
                className="flex gap-0 mb-3 last:mb-0 animate-[fadeSlideIn_0.3s_ease_forwards]"
              >
                <div className="shrink-0 w-full">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-semibold" style={{ color: agentColor[msg.from] }}>{msg.from}</span>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300 dark:text-gray-700 shrink-0">
                      <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="font-semibold" style={{ color: agentColor[msg.to] }}>{msg.to}</span>
                  </div>
                  <div className="pl-0 sm:pl-3 text-gray-600 dark:text-gray-400 leading-relaxed">
                    "{msg.text}"
                  </div>
                </div>
              </div>
            ))}
            {visibleCount === 0 && (
              <div className="flex items-center justify-center h-[160px] text-gray-300 dark:text-gray-700 text-sm">
                <span className="animate-pulse">connecting...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
