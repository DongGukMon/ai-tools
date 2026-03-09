const tuiTasks = [
  { id: 't-a1', title: 'Auth module', status: 'in_progress', blockedBy: '—', diff: 'medium' },
  { id: 't-b2', title: 'API routes', status: 'in_progress', blockedBy: '—', diff: 'easy' },
  { id: 't-c3', title: 'Tests', status: 'completed', blockedBy: '—', diff: 'easy' },
  { id: 't-d4', title: 'Deploy', status: 'blocked', blockedBy: 'a1,b2,c3', diff: 'easy' },
  { id: 't-e5', title: 'Documentation', status: 'created', blockedBy: '—', diff: 'easy' },
] as const

function statusDot(s: string) {
  switch (s) {
    case 'in_progress': return { color: '#8B5CF6', label: 'running', pulse: true }
    case 'completed': return { color: '#34D399', label: 'done', pulse: false }
    case 'blocked': return { color: '#FBBF24', label: 'blocked', pulse: false }
    default: return { color: '#64748B', label: 'created', pulse: false }
  }
}

export function TuiDashboard() {
  return (
    <section className="px-6 pb-20 sm:pb-28">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <p className="text-xs font-mono tracking-widest uppercase text-[#8B5CF6] mb-3">Monitor</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">Real-time Dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg">Live TUI dashboard with task statuses, stack progress, and keyboard shortcuts. Also available as a web dashboard.</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-[#0D1526] border-b border-gray-200 dark:border-slate-800">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
            </div>
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-600 ml-2">whip dashboard</span>
          </div>
          <div className="bg-[#FAFBFC] dark:bg-[#060E1F] font-mono text-xs sm:text-[13px]">
            <div className="flex items-center gap-4 sm:gap-6 px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-slate-800/60">
              <span className="text-gray-400 dark:text-gray-600">5 tasks</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-pulse" />
                <span style={{ color: '#8B5CF6' }}>2 running</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                <span style={{ color: '#34D399' }}>1 done</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]" />
                <span style={{ color: '#FBBF24' }}>1 blocked</span>
              </span>
            </div>
            <div className="grid grid-cols-[4.5rem_1fr_6rem_6.5rem_3.5rem] sm:grid-cols-[5rem_1fr_7rem_7.5rem_4.5rem] px-4 sm:px-5 py-2 text-[10px] sm:text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wider border-b border-gray-100 dark:border-slate-800/60">
              <span>ID</span><span>Title</span><span>Status</span><span>Blocked By</span><span>Diff</span>
            </div>
            {tuiTasks.map((t, i) => {
              const s = statusDot(t.status)
              return (
                <div
                  key={t.id}
                  className={`grid grid-cols-[4.5rem_1fr_6rem_6.5rem_3.5rem] sm:grid-cols-[5rem_1fr_7rem_7.5rem_4.5rem] px-4 sm:px-5 py-2 border-b border-gray-50 dark:border-slate-800/30 ${i === 0 ? 'bg-[#8B5CF608]' : ''}`}
                >
                  <span className="text-gray-400 dark:text-gray-600">{t.id}</span>
                  <span className="text-gray-800 dark:text-gray-200 truncate">{t.title}</span>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.pulse ? 'animate-pulse' : ''}`} style={{ backgroundColor: s.color }} />
                    <span style={{ color: s.color }}>{s.label}</span>
                  </span>
                  <span className="text-gray-400 dark:text-gray-600">{t.blockedBy}</span>
                  <span className="text-gray-400 dark:text-gray-600">{t.diff}</span>
                </div>
              )
            })}
            <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 text-[10px] text-gray-400 dark:text-gray-600">
              <div className="flex items-center gap-3">
                <span><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[9px]">R</kbd> remote</span>
                <span><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[9px]">D</kbd> detail</span>
                <span><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[9px]">Q</kbd> quit</span>
              </div>
              <span>↻ 2s auto-refresh</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
