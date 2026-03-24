# Terminal Broadcast

System for moving a terminal pane's xterm runtime to a different UI container. One PTY has exactly one xterm instance — broadcasting swaps the "consumer" (UI slot) that the runtime is attached to.

## Concepts

### Consumer Model

```
TerminalSession (1:1 with PTY)
  └─ runtime (1 xterm + 1 PTY listener)
       └─ consumer: the UI slot currently holding the runtime

Consumer slots:
  ├─ WorktreePane        — split pane in the Terminal tab (default)
  ├─ PipSlot             — bottom-right overlay on Changes/Browser tab
  └─ GlobalTerminalSlot  — mirror tab in Global Terminal
```

- One runtime per PTY. Never cloned.
- Broadcasting = consumer swap (`runtime.attach(targetContainer)`)
- The original pane shows a frozen snapshot (canvas capture) + overlay

### Broadcast State Machine

```
idle ──[mirror button]──→ broadcasting(mirror)
idle ──[tab switch]─────→ broadcasting(pip)
broadcasting ──[stop]───→ idle (restore original size)
```

- At most one active broadcast (mirror XOR pip)
- State: `BroadcastStore` (Zustand, in-memory only)
- Deterministic transitions: no simultaneous broadcasts

## Features

### PiP (Picture-in-Picture)

- **Trigger**: automatic when switching from Terminal tab to Changes/Browser tab
- **Position**: 360x200 overlay at bottom-right of tab content
- **Behavior**: attaches the focused pane's runtime to the PiP container
- **Dismiss**: auto on return to Terminal tab / dismiss button → restore via arrow
- **Policy**: skipped if the focused pane is already broadcasting (mirror)

### Mirror (Global Terminal)

- **Trigger**: mirror button in terminal toolbar (copy icon)
- **Position**: new tab in Global Terminal
- **Title**: `org/repo > worktree name`
- **Indicator**: red live-ping dot on top-left corner of the terminal icon
- **Dismiss**: close the mirror tab or click Stop on the original pane overlay
- **Lifecycle**: manual — user explicitly adds/removes. Not auto-removed on tab switch.

### Broadcast Overlay (Original Pane)

- All xterm canvas layers (background + text + cursor) are composited into a single snapshot before broadcasting starts
- Original pane shows the frozen snapshot image + `bg-black/40 backdrop-blur-[1.3px]` overlay
- Radio icon + "Broadcasting" label (font-black) + Stop button
- Runtime is active in the target container — the original pane is static

## Persistence

- Mirror tabs are **not persisted** (ephemeral)
  - `debouncedSave`: filters out mirror tabs before writing to disk
  - `resolveGlobalTerminalLayout`: strips stale mirror tabs on load (belt-and-suspenders)
- `BroadcastStore`: in-memory only, resets on app restart

## Resize

- Original pane's resize is suppressed via `suppressedPaneIds` during broadcast
- The target consumer (PiP/mirror) controls PTY resize
- On broadcast end, PTY is restored to `originalCols/originalRows`

## Key Files

| File | Role |
|------|------|
| `src/store/broadcast.ts` | BroadcastStore — state machine |
| `src/lib/terminal-runtime.ts` | `getRuntime`, `captureRuntimeSnapshot`, `getRuntimeSize`, `suppressResizeForPane` |
| `src/components/terminal/TerminalInstance.tsx` | Original pane: snapshot + overlay + Stop button |
| `src/components/tab/AppTabContent.tsx` | PiP policy + PiP container |
| `src/hooks/useTerminalCommandPipeline.ts` | Mirror button → startBroadcast + addMirrorTab |
| `src/hooks/useGlobalTerminal.ts` | Mirror tab close → stopBroadcast |
| `src/components/terminal/GlobalTerminalTabBar.tsx` | Mirror tab UI (live indicator + title) |
| `src/store/panel-layout.ts` | `addGlobalTerminalMirrorTab`, persistence filtering |

## WebGL Note

The xterm.js WebGL addon must be initialized with `preserveDrawingBuffer: true` for `canvas.toDataURL()` to work. Without this, snapshot capture returns a blank image.
