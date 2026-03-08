import { useState, useCallback } from 'react'

export type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'cmd'

interface VirtualKeysState {
  showKeys: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  cmd: boolean
}

export function useVirtualKeys() {
  const [state, setState] = useState<VirtualKeysState>({
    showKeys: false,
    ctrl: false,
    alt: false,
    shift: false,
    cmd: false,
  })

  const hasModifier = state.ctrl || state.alt || state.shift || state.cmd

  const togglePanel = useCallback(() => {
    setState(s => ({ ...s, showKeys: !s.showKeys }))
  }, [])

  const toggleModifier = useCallback((mod: ModifierKey) => {
    setState(s => ({ ...s, [mod]: !s[mod] }))
  }, [])

  const clearModifiers = useCallback(() => {
    setState(s => ({ ...s, ctrl: false, alt: false, shift: false, cmd: false }))
  }, [])

  const applyModifiers = useCallback((ch: string): string => {
    if (!hasModifier || ch.length !== 1) return ch + '\n'
    let result = ch
    if (state.shift) result = result.toUpperCase()
    if (state.ctrl || state.cmd) {
      const code = result.toLowerCase().charCodeAt(0)
      if (code >= 97 && code <= 122) {
        result = String.fromCharCode(code - 96)
      }
    }
    if (state.alt) result = '\x1b' + result
    return result
  }, [hasModifier, state.ctrl, state.alt, state.shift, state.cmd])

  const modifierLabel = hasModifier
    ? [state.ctrl && 'Ctrl', state.cmd && 'Cmd', state.alt && 'Alt', state.shift && 'Shift']
        .filter(Boolean).join('+') + '+'
    : null

  return {
    showKeys: state.showKeys,
    modifiers: { ctrl: state.ctrl, alt: state.alt, shift: state.shift, cmd: state.cmd },
    hasModifier,
    modifierLabel,
    togglePanel,
    toggleModifier,
    clearModifiers,
    applyModifiers,
  }
}
