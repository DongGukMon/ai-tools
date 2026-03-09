import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { siteMeta } from '../../content/site'
import { ThemeToggle } from '../ThemeToggle'

interface MarketingShellProps {
  children: ReactNode
  eyebrow?: string
  title?: string
  subtitle?: string
}

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/tools', label: 'Tools' },
]

export function MarketingShell({ children, eyebrow, title, subtitle }: MarketingShellProps) {
  return (
    <div className="noise-overlay min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#eef4ff_0%,#f5f7fb_36%,#f5f5f7_100%)] text-[#10131a] dark:bg-[linear-gradient(180deg,#060a16_0%,#091122_32%,#0d1323_100%)] dark:text-[#f5f7ff]">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-[#d8e2ff] bg-white/62 backdrop-blur-2xl dark:border-white/8 dark:bg-[#060a16]/55">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-[-0.02em] text-[#10131a] dark:text-white">whip</span>
            <span className="hidden text-sm text-[#667085] dark:text-white/55 sm:inline">inside ai-tools</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <nav className="hidden items-center gap-1 rounded-full border border-[#d8e2ff] bg-white/72 p-1 shadow-[0_10px_30px_rgba(91,108,255,0.08)] dark:border-white/10 dark:bg-white/5 md:flex">
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-full px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-[linear-gradient(135deg,#4f46e5,#8b5cf6)] text-white'
                        : 'text-[#667085] hover:text-[#10131a] dark:text-white/55 dark:hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <ThemeToggle />
            <Link
              to="/login"
              className="rounded-full bg-[linear-gradient(135deg,#4f46e5,#8b5cf6)] px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(91,108,255,0.28)] transition-opacity hover:opacity-92"
            >
              Connect
            </Link>
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_60%_50%_at_50%_-8%,rgba(79,70,229,0.20),transparent),radial-gradient(circle_at_80%_8%,rgba(59,130,246,0.12),transparent_28%)] dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_-8%,rgba(99,102,241,0.26),transparent),radial-gradient(circle_at_80%_8%,rgba(59,130,246,0.18),transparent_26%)]" />

        <main className="relative mx-auto max-w-7xl px-6 pb-24 pt-28 sm:pt-32">
          {(eyebrow || title || subtitle) && (
            <section className="mb-14 text-center sm:mb-18">
              {eyebrow && (
                <p className="mb-4 text-xs uppercase tracking-[0.28em] text-[#4f46e5] dark:text-[#8ea0ff]">
                  {eyebrow}
                </p>
              )}
              {title && (
                <h1 className="mx-auto max-w-5xl text-4xl font-semibold tracking-[-0.04em] text-[#10131a] dark:text-white sm:text-6xl">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-[#667085] dark:text-white/70 sm:text-xl">
                  {subtitle}
                </p>
              )}
            </section>
          )}

          {children}
        </main>
      </div>

      <footer className="border-t border-[#d8e2ff] dark:border-white/8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-sm text-[#667085] dark:text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-semibold text-[#10131a] dark:text-white">ai-tools</span>
            <span className="mx-2 text-[#c2c8d3] dark:text-white/18">/</span>
            <span>Orchestration, coordination, secrets, forms, and remote editing for AI agent work.</span>
          </div>
          <a
            href={siteMeta.repoURL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[#1d1d1f] dark:hover:text-white"
          >
            {siteMeta.repoURL.replace('https://', '')}
          </a>
        </div>
      </footer>
    </div>
  )
}
