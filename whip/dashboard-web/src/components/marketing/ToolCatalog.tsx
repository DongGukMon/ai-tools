import type { ToolEntry } from '../../content/site'

interface ToolCatalogProps {
  tools: ToolEntry[]
  compact?: boolean
}

function FeaturedCard({ tool }: { tool: ToolEntry }) {
  return (
    <a
      href={tool.href}
      target="_blank"
      rel="noreferrer"
      className="group relative col-span-full overflow-hidden rounded-[2rem] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.88),rgba(238,244,255,0.80))] p-8 shadow-[0_24px_64px_rgba(76,94,160,0.12)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(76,94,160,0.18)] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.72),rgba(30,27,75,0.48))] dark:shadow-[0_24px_64px_rgba(0,0,0,0.32)] dark:hover:shadow-[0_32px_80px_rgba(0,0,0,0.40)] sm:p-10 md:grid md:grid-cols-[1fr_auto] md:gap-10"
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30 blur-[80px] transition-opacity duration-500 group-hover:opacity-50" style={{ background: `radial-gradient(circle, ${tool.accent}, transparent 70%)` }} />

      <div className="relative">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold"
            style={{ backgroundColor: `${tool.accent}22`, color: tool.accent }}
          >
            {tool.name.slice(0, 2).toUpperCase()}
          </span>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#94a3b8] dark:text-white/40">
            {tool.category}
          </p>
        </div>
        <h3 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#0f172a] dark:text-white sm:text-4xl">
          {tool.name}
        </h3>
        <p className="mt-2 text-base font-medium text-[#334155] dark:text-white/86">
          {tool.tagline}
        </p>
        <p className="mt-3 max-w-xl text-sm leading-7 text-[#667085] dark:text-white/60">
          {tool.description}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#4f46e5] transition-colors group-hover:text-[#6366f1] dark:text-[#a5b4fc] dark:group-hover:text-[#c7d2fe]">
          Explore on GitHub
          <svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </div>
      </div>

      <div className="mt-6 hidden shrink-0 items-center md:mt-0 md:flex">
        <div className="rounded-2xl border border-[#d8e2ff]/60 bg-white/40 p-5 dark:border-white/6 dark:bg-white/3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#94a3b8] dark:text-white/32">Highlights</div>
          <ul className="mt-3 space-y-2 text-sm text-[#667085] dark:text-white/55">
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#4f46e5] dark:bg-[#818cf8]" />
              Stacked task lanes
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#4f46e5] dark:bg-[#818cf8]" />
              tmux-backed agents
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#4f46e5] dark:bg-[#818cf8]" />
              Web + TUI dashboard
            </li>
          </ul>
        </div>
      </div>
    </a>
  )
}

function CompanionCard({ tool }: { tool: ToolEntry }) {
  return (
    <a
      href={tool.href}
      target="_blank"
      rel="noreferrer"
      className="group relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/62 p-6 shadow-[0_18px_50px_rgba(76,94,160,0.08)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(76,94,160,0.14)] dark:border-white/10 dark:bg-white/4 dark:shadow-[0_20px_60px_rgba(0,0,0,0.24)] dark:hover:shadow-[0_28px_70px_rgba(0,0,0,0.32)]"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 blur-[50px] transition-opacity duration-500 group-hover:opacity-40" style={{ background: `radial-gradient(circle, ${tool.accent}, transparent 70%)` }} />

      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold transition-transform duration-300 group-hover:scale-110"
              style={{ backgroundColor: `${tool.accent}1a`, color: tool.accent }}
            >
              {tool.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#0f172a] dark:text-white">
                {tool.name}
              </h3>
              <p className="text-[11px] uppercase tracking-[0.20em] text-[#94a3b8] dark:text-white/40">
                {tool.category}
              </p>
            </div>
          </div>
          <svg className="h-5 w-5 shrink-0 text-[#c2c8d3] transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-[#4f46e5] dark:text-white/20 dark:group-hover:text-[#a5b4fc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </div>

        <p className="mt-4 text-sm font-medium text-[#334155] dark:text-white/86">
          {tool.tagline}
        </p>
        <p className="mt-2 text-sm leading-7 text-[#667085] dark:text-white/60">
          {tool.description}
        </p>

        <div className="mt-5 flex items-center gap-2 text-xs font-medium text-[#4f46e5] opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:text-[#a5b4fc]">
          View README
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </div>
      </div>
    </a>
  )
}

export function ToolCatalog({ tools, compact }: ToolCatalogProps) {
  const featured = tools.find(t => t.id === 'whip')
  const companions = tools.filter(t => t.id !== 'whip')
  const displayCompanions = compact ? companions.slice(0, 3) : companions

  return (
    <div className="space-y-8">
      {featured && !compact && <FeaturedCard tool={featured} />}

      <div className={`grid gap-4 ${compact ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
        {compact && featured && <CompanionCard tool={featured} />}
        {displayCompanions.map(tool => (
          <CompanionCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  )
}
