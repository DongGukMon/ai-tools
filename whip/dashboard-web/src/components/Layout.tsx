import { type ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { Clock } from './Clock'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 transition-colors text-[0.9375rem]">
      <header className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-[#0B1120]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded">WHIP</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">Task Orchestrator</span>
          </div>
          <div className="flex items-center gap-3">
            <Clock />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-5 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}
