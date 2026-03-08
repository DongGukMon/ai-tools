import type { ModifierKey } from '../hooks/useVirtualKeys'

const T = {
  fg: '#FFB255',
  bold: '#EC9B4B',
  bg: '#001A42',
  border: '#0E2550',
  dim: '#7A6840',
} as const

const KEYS: readonly ({ label: string; key: string } | { label: string; toggle: ModifierKey })[] = [
  { label: 'ESC', key: '\x1b' },
  { label: 'Tab', key: '\t' },
  { label: 'Ctrl', toggle: 'ctrl' },
  { label: 'Alt', toggle: 'alt' },
  { label: 'Shift', toggle: 'shift' },
  { label: 'Cmd', toggle: 'cmd' },
  { label: '↑', key: '\x1b[A' },
  { label: '↓', key: '\x1b[B' },
  { label: '←', key: '\x1b[D' },
  { label: '→', key: '\x1b[C' },
]

interface VirtualKeyBarProps {
  modifiers: Record<ModifierKey, boolean>
  disabled?: boolean
  onToggleModifier: (mod: ModifierKey) => void
  onSendKey: (key: string) => void
}

export function VirtualKeyBar({ modifiers, disabled, onToggleModifier, onSendKey }: VirtualKeyBarProps) {
  return (
    <div className="flex items-center gap-1.5 pb-2 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
      {KEYS.map((btn) => {
        const isToggle = 'toggle' in btn
        const isActive = isToggle ? modifiers[btn.toggle] : false
        return (
          <button
            key={btn.label}
            onClick={() => {
              if (isToggle) onToggleModifier(btn.toggle)
              else onSendKey(btn.key)
            }}
            disabled={disabled}
            className="px-3 py-2 rounded-md text-xs font-mono font-semibold transition-all active:scale-95 shrink-0 select-none"
            style={{
              color: isActive ? T.bg : T.fg,
              backgroundColor: isActive ? T.bold : T.border,
              minHeight: 36,
            }}
          >
            {btn.label}
          </button>
        )
      })}
    </div>
  )
}
