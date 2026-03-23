# Grove

Git project manager with split terminal and diff viewer for macOS. Each project gets its own source clone and worktrees, each worktree gets persistent split terminal sessions. Tracks Claude Code and Codex AI session status in real-time with visual indicators. Supports line-level staging, unstaging, and discarding.

## Features

- **Multi-project sidebar** — Add git projects by URL, drag to reorder, manage worktrees per project
- **Split terminal** — Horizontal/vertical splits with persistent layouts per worktree
- **Diff viewer** — Commit history, file diffs, hunk/line-level stage/unstage/discard
- **AI status tracking** — Real-time running/idle/attention indicators for Claude Code and Codex sessions
- **Terminal themes** — Preset themes + auto-detect from Terminal.app
- **Merge tracking** — Merge default branch with behind-remote indicators

## Workflow

1. **Add a project** — Clone a git repo by URL. Grove keeps a source clone on `main`.
2. **Create worktrees** — Branch off into git worktrees for parallel work.
3. **Split terminals** — Each worktree gets its own split terminal layout that persists across restarts.
4. **Review changes** — Use the diff panel to browse commits, stage/unstage hunks or individual lines, and discard changes.
5. **Track AI sessions** — Claude Code and Codex sessions running in terminals show live status badges in the sidebar.

## App Data

All data lives under `~/.grove/`:

```
~/.grove/
├── config.json                              # App settings, terminal theme
├── terminal-layouts.json                    # Split tree per worktree
├── terminal-session-snapshots.json          # Scrollback/CWD per pane
├── panel-layouts.json                       # 3-panel size ratios
└── <host>/<org>/<repo>/
    ├── source/                              # Source clone (always main)
    └── worktrees/<name>/                    # Git worktrees
```

## Stack

- **Backend**: Rust (Tauri v2, portable-pty, git2, plist)
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4
- **UI**: allotment (split panes), xterm.js (terminal), Zustand (state)

## Installation

```bash
bash install-local.sh          # Tauri (default)
bash install-local.sh electron # Electron
bash install-local.sh all      # Both
```

## Development

```bash
pnpm install
pnpm tauri dev         # Dev server + Tauri window
pnpm lint              # ESLint
pnpm test              # Vitest
```
