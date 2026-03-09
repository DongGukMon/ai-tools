import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'
import { IrcDemo } from './landing/IrcDemo'
import { TerminalDemo } from './landing/TerminalDemo'
import { TuiDashboard } from './landing/TuiDashboard'

const features = [
  {
    label: 'Parallel Dispatch',
    desc: 'Use the default global lane for one-off tasks, or switch to a named workspace when the work should move as a stacked lane.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M21 3l-7 7" /><path d="M3 3l7 7" />
        <path d="M16 21h5v-5" /><path d="M8 21H3v-5" /><path d="M21 21l-7-7" /><path d="M3 21l7-7" />
      </svg>
    ),
  },
  {
    label: 'IRC Coordination',
    desc: 'Agents communicate through claude-irc. The bus stays shared, while each workspace gets its own master identity.',
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
    desc: 'Monitor tasks, workspaces, chat, and master terminal state from a single browser tab.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
]

const quickStartSteps = [
  { step: '01', title: 'Install', code: 'curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/whip/install.sh | bash' },
  { step: '02', title: 'Start remote', code: 'whip remote --workspace issue-sweep --tunnel your-domain.com' },
  { step: '03', title: 'Connect', code: 'Open the generated dashboard URL' },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 transition-colors">
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
              Use global for quick single-task work, or open a named workspace when the job should advance as a stacked lane.
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

      <TerminalDemo />
      <TuiDashboard />
      <IrcDemo />

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

      <section className="px-6 pb-20 sm:pb-28">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-mono tracking-widest uppercase text-gray-400 dark:text-gray-600 mb-8">Quick start</p>
          <div className="grid sm:grid-cols-3 gap-6">
            {quickStartSteps.map(s => (
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
