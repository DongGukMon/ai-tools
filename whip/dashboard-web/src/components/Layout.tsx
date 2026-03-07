import { type ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 transition-colors">
      <header className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-[#0B1120]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[#8B5CF6] font-bold text-lg">whip</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">dashboard</span>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
