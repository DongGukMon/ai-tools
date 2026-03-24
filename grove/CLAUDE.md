# Grove

Tauri v2 macOS app — Git project manager + split terminal + diff viewer.

## Feature Docs

- [Terminal Broadcast](docs/terminal-broadcast.md) — PiP, Mirror, consumer model, persistence policy

## Stack

- **Backend**: Rust (Tauri v2, portable-pty, git2, plist)
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4
- **UI**: allotment (split panes), xterm.js (terminal), lucide-react (icons), Zustand (state)

## Commands

```bash
pnpm install
pnpm lint              # ESLint for src/**/*.{ts,tsx}
pnpm test              # Vitest
pnpm tauri dev         # Dev server + Tauri window
pnpm tauri build       # Production build
```

## Structure

```
src/
├── components/
│   ├── ui/                # Design system: Button, Input, Badge, Dialog, Toast
│   ├── sidebar/           # Project tree, worktree management
│   ├── terminal/          # xterm.js + PTY + split panes + theme settings
│   └── diff/              # Commit list, file list, diff viewer, hunk actions
├── store/                 # Zustand: project.ts, terminal.ts, diff.ts, toast.ts
├── hooks/                 # useProject, useTerminal, useDiff, useToast
├── lib/
│   ├── tauri.ts           # Type-safe IPC wrappers
│   ├── split-tree.ts      # Terminal layout tree operations (pure functions)
│   ├── terminal-themes.ts # Preset terminal color themes
│   └── cn.ts              # clsx + tailwind-merge utility
├── types/                 # Shared TypeScript interfaces
├── Layout.tsx             # 3-panel allotment layout
└── App.tsx                # Root (Layout + ToastContainer)

src-tauri/src/
├── lib.rs                 # All Tauri commands (config, git_project, pty, git_diff)
├── config.rs              # App config + terminal layout persistence
├── git_project.rs         # Clone, worktree, project CRUD
├── git_diff.rs            # Diff, stage/unstage/discard (file/hunk/line)
├── pty.rs                 # PTY spawn, read, write, resize, close
└── terminal_theme.rs      # Terminal.app color auto-detection (AppleScript)
```

## App Data

- `~/.grove/config.json` — app settings, terminal theme override
- `~/.grove/terminal-layouts.json` — split tree structure + size ratios per worktree
- `~/.grove/<host>/<org>/<repo>/source/` — SOT clone (always main)
- `~/.grove/<host>/<org>/<repo>/worktrees/<name>/` — git worktrees

## Code Style

### `cn()` for className composition

- If `className` has multiple classes, wrap it in `cn(...)`
- Use object syntax for conditional classes
- Do not use ternary expressions inside `cn(...)`

```tsx
// ❌
className={`flex ${isActive ? "bg-blue-500" : "text-gray-500"}`}
className="flex items-center gap-2"
className={cn("flex", isActive ? "bg-blue-500" : "text-gray-500")}
className={cn("flex", isActive && "bg-blue-500")}

// ✅
className={cn("flex items-center gap-2")}
className={cn("flex", {
  "bg-blue-500": isActive,
  "text-gray-500": !isActive,
})}
```

### UI primitives — no raw `<button>` / `<input>`

```tsx
import { Button } from "../ui/button";
<Button variant="default" size="sm">Save</Button>
// Variants: default, secondary, ghost, outline, destructive
// Sizes: sm, md, lg, icon
```

Available: `Button`, `Input`, `Badge`, `Dialog`, `Toast` (via `useToast()`)

### Layout sizes — 0-1 ratios, not pixels

```json
{ "sizes": [0.3, 0.7] }
```

### Zustand selectors — snapshots must be stable

- `useShallow(...)` selectors must return a top-level primitive or array/object whose shallow members stay stable for unchanged state
- Do not return `{ items: [] }`, `{ statuses: computedArray }`, or other object-wrapped freshly allocated arrays from store selectors
- If a selector naturally produces a list, return the list directly and let `useShallow(...)` compare that array
- For empty results, prefer a shared constant like `EMPTY_*` when the selector may run before any data exists
- When adding a selector around `useTerminalStore` or another Zustand store, add a regression test if an unchanged store state could still allocate new snapshot values

### Tests — write alongside features

Before closing work, run `pnpm lint && pnpm test`.
