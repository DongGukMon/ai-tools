# Terminal Broadcast

System for moving a terminal pane's xterm runtime to a different UI container. One PTY has exactly one xterm instance — broadcasting swaps the "consumer" (UI slot) that the runtime is attached to.

This document reflects the current implementation in `src/store/broadcast.ts`, `src/components/tab/AppTabContent.tsx`, and the terminal runtime consumers.

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

## Invariants

- Mirror is **PTY-scoped**.
  A mirrored PTY is tracked globally by `ptyId` because the Global Terminal is not tied to a single worktree tab.
- PiP is **worktree-space-scoped**.
  Each worktree tab session owns at most one PiP slot, keyed by `worktreePath`.
- Multiple worktrees may each have an active PiP state at the same time.
  The visible PiP container always renders the currently selected worktree's PiP.
- A worktree switch must never keep showing the previous worktree's PTY in the shared PiP container.
- The visible PiP consumer identity is `worktreePath + ptyId + paneId`.
  Reusing only `worktreePath` is insufficient because the shared PiP container can otherwise keep the wrong runtime attached.
- Removing a worktree must clear any PiP or mirror state that references that worktree's PTYs.

### Broadcast State Machine

```
idle ──[mirror button]──→ broadcasting(mirror)
idle ──[tab switch]─────→ broadcasting(pip)
broadcasting ──[stop]───→ idle (restore original size)
```

- Mirrors: many global entries keyed by `ptyId`
- PiP: many worktree-local entries keyed by `worktreePath`
- State: `BroadcastStore` (Zustand, in-memory only)
- Deterministic transitions: replacing PiP for one worktree must not affect another worktree's PiP or any mirror entry

## Features

### PiP (Picture-in-Picture)

- **Trigger**: automatic when switching from Terminal tab to Changes/Browser tab
- **Position**: 360x200 overlay at bottom-right of tab content
- **Scope**: one PiP slot per worktree space
- **Behavior**: attaches the selected worktree's focused pane runtime to the shared PiP container
- **Worktree switch**: detaches the previous worktree's PiP consumer and attaches the newly selected worktree's PiP consumer
- **Consumer key**: the visible PiP subtree and attach bookkeeping must be keyed by `worktreePath + ptyId + paneId`
- **Retention**: active PiP runtimes stay retained offscreen so switching back to a worktree can reattach the same runtime instead of recreating it
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
- PiP state is not persisted either. Worktree switching keeps it only for the current in-memory session.

## Resize

- The active consumer controls PTY resize.
- When a PTY is mirrored or shown in PiP, the original pane must not keep ownership of the runtime.
- When the visible PiP worktree changes, the previous PiP runtime is detached but retained; the newly selected worktree's PiP runtime becomes the resize owner.
- On broadcast end, PTY is restored to `originalCols/originalRows` via an explicit `resizePty(...)` call. Detach alone is not sufficient.

## Regression Matrix

These cases should stay covered by tests or manual verification:

1. Mirror a PTY, then split panes in the source worktree. The mirror must stay attached to the mirrored runtime.
2. Enter Changes while the focused PTY is mirrored. PiP must not start for that PTY.
3. Create PiP in worktree A, create PiP in worktree B, then switch A ↔ B while staying outside the Terminal tab. The shared PiP container must always show the selected worktree's PTY.
4. Stop PiP for worktree A. Worktree B's PiP must remain intact.
5. Remove a worktree that currently owns PiP or mirror state. All broadcast entries tied to that worktree's PTYs must be cleared.
6. Return from Changes/Browser to Terminal while PiP is active. The source PTY must restore to the pre-broadcast size.

## Key Files

| File | Role |
|------|------|
| `src/store/broadcast.ts` | BroadcastStore — PTY-global mirrors and worktree-scoped PiP slots |
| `src/lib/terminal-runtime.ts` | Runtime retain/release, attach/detach, snapshots, resize ownership |
| `src/components/terminal/TerminalInstance.tsx` | Original pane: snapshot + overlay + Stop button |
| `src/components/tab/AppTabContent.tsx` | Worktree-aware PiP policy, runtime retention, shared PiP container |
| `src/hooks/useTerminalCommandPipeline.ts` | Mirror button → startBroadcast + addMirrorTab |
| `src/hooks/useGlobalTerminal.ts` | Mirror tab close → stopBroadcast |
| `src/components/terminal/GlobalTerminalTabBar.tsx` | Mirror tab UI (live indicator + title) |
| `src/store/project.ts` | Worktree removal cleanup for terminal broadcast state |
| `src/store/panel-layout.ts` | `addGlobalTerminalMirrorTab`, persistence filtering |
