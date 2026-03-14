# Grove

Tauri v2 desktop app — Git-aware terminal with sidebar navigation and inline diff viewer.

## Tech Stack

- **Backend**: Rust (Tauri v2)
- **Frontend**: React 19 + TypeScript + Vite
- **Layout**: allotment (resizable 3-panel)
- **Terminal**: xterm.js with WebGL renderer
- **State**: Zustand

## Development

```bash
cd grove
npm install
npm run tauri dev    # Start dev server + Tauri window
npm run tauri build  # Production build
```

## Project Structure

```
grove/
├── src/                    # Frontend (React + TypeScript)
│   ├── types/              # Shared type definitions
│   ├── lib/tauri.ts        # Type-safe IPC invoke wrappers
│   ├── store/              # Zustand stores
│   ├── Layout.tsx          # 3-panel allotment layout
│   ├── App.tsx             # Root component
│   └── App.css             # Dark theme styles
├── src-tauri/              # Backend (Rust)
│   ├── src/
│   │   ├── lib.rs          # Command handlers + app setup
│   │   ├── main.rs         # Entry point
│   │   └── terminal_theme.rs  # Terminal.app theme detection
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

## IPC Commands

Commands are registered in `lib.rs` with section markers (W1–W4). Each worker owns their section:
- **W1 (Scaffold)**: `get_terminal_theme`, `get_app_config`, `save_app_config`
- **W2 (Sidebar)**: `list_projects`, `add_project`, `create_project`, `remove_project`, `add_worktree`, `remove_worktree`, `list_worktrees`
- **W3 (Terminal)**: `create_pty`, `write_pty`, `resize_pty`, `close_pty`
- **W4 (Diff)**: `get_status`, `get_commits`, `get_working_diff`, `get_commit_diff`, `stage_file`, `unstage_file`, `discard_file`, `stage_hunk`, `unstage_hunk`, `discard_hunk`, `stage_lines`, `unstage_lines`, `discard_lines`

Stub commands use `todo!()` — they compile but panic at runtime until implemented.
