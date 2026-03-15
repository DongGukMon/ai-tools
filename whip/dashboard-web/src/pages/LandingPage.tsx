import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Seo } from '../components/Seo'
import { HeroRunPreview } from '../components/marketing/HeroRunPreview'
import { MarketingShell } from '../components/marketing/MarketingShell'
import { WorkModeShowcase } from '../components/marketing/WorkModeShowcase'
import { siteMeta } from '../content/site'

export function LandingPage() {
  return (
    <>
      <Seo
        title="Task Orchestrator for AI Agents"
        description={siteMeta.defaultDescription}
        path="/"
        keywords={['whip', 'task orchestrator', 'ai-tools', 'agent workflow', 'stacked workspace', 'claude-irc']}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: siteMeta.name,
            url: siteMeta.origin,
            description: siteMeta.defaultDescription,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'whip',
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'macOS, Linux, Windows',
            isPartOf: {
              '@type': 'SoftwareSourceCode',
              name: 'ai-tools',
              codeRepository: siteMeta.repoURL,
            },
            description: siteMeta.defaultDescription,
          },
        ]}
      />
      <MarketingShell>
        {/* Hero */}
        <section className="hero-stagger pb-24 pt-8 text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-[#4f46e5] dark:text-[#94a3ff]">
            Task Orchestrator for AI Agents
          </p>
          <h1 className="mx-auto mt-5 max-w-5xl text-5xl font-semibold tracking-[-0.05em] text-[#0f172a] dark:text-white sm:text-7xl lg:text-8xl">
            One lead.
            <br />
            Many agents.
            <br />
            Ship faster.
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#667085] dark:text-white/60 sm:text-xl">
            Split complex tasks across parallel AI Agent sessions. Wire dependencies. Watch them converge.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/login"
              className="group relative rounded-full bg-[linear-gradient(135deg,#4f46e5,#7c3aed)] px-8 py-4 text-sm font-semibold text-white shadow-[0_20px_40px_rgba(99,102,241,0.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_48px_rgba(99,102,241,0.38)]"
            >
              <span className="relative z-10">Connect dashboard</span>
            </Link>
            <a
              href={siteMeta.repoURL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[#d0dbf7] bg-white/60 px-8 py-4 text-sm font-semibold text-[#334155] backdrop-blur-xl transition-all hover:bg-white hover:shadow-[0_12px_32px_rgba(76,94,160,0.10)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/8"
            >
              View on GitHub
            </a>
          </div>
        </section>

        {/* Product shot */}
        <section className="pb-28">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto max-w-[84rem]"
          >
            {/* Ambient glows */}
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(79,70,229,0.14),transparent_64%)] blur-[80px] dark:bg-[radial-gradient(circle,rgba(99,102,241,0.22),transparent_64%)]" />
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.12),transparent_64%)] blur-[60px] dark:bg-[radial-gradient(circle,rgba(59,130,246,0.18),transparent_64%)]" />

            <div className="relative rounded-[2.5rem] bg-white/25 p-6 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.90),inset_0_-0.5px_0_rgba(255,255,255,0.25),0_32px_100px_rgba(76,94,160,0.08),0_8px_32px_rgba(76,94,160,0.04)] backdrop-blur-[24px] backdrop-saturate-[1.8] dark:bg-white/[0.03] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_32px_100px_rgba(0,0,0,0.50)] dark:backdrop-saturate-100 sm:p-8 lg:p-10">
              <div className="mx-auto max-w-3xl text-center">
                <p className="text-xs uppercase tracking-[0.24em] text-[#4f46e5] dark:text-[#94a3ff]">Lead surface</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#0f172a] dark:text-white sm:text-5xl">
                  See the run take shape,
                  <br />
                  not just the end result.
                </h2>
                <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#667085] dark:text-white/60 sm:text-lg">
                  Plan the work, dispatch AI companion agents, and keep the moving parts visible while the stack converges.
                </p>
              </div>

              <div className="mt-10 sm:mt-12">
                <HeroRunPreview />
              </div>
            </div>
          </motion.div>
        </section>

        {/* Execution modes */}
        <WorkModeShowcase />
      </MarketingShell>
    </>
  )
}
