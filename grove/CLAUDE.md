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

## Code Style

### className: use `cn()` utility, not ternary in template literals

```tsx
// ❌ Bad
className={`flex ${isActive ? "bg-blue-500 text-white" : "text-gray-500"}`}

// ✅ Good
import { cn } from "../../lib/cn";
className={cn("flex", isActive && "bg-blue-500 text-white", !isActive && "text-gray-500")}
```

### UI components: use `src/components/ui/` primitives

```tsx
// ❌ Bad — raw button
<button className="px-3 py-1 ...">Save</button>

// ✅ Good — design system component
import { Button } from "../ui/button";
<Button variant="default" size="sm">Save</Button>
```

Available: `Button`, `Input`, `Badge`, `Dialog`, `Toast` (via `useToast()`)

### Layout ratios: store as 0-1 proportions, not pixels

```json
{ "sizes": [0.3, 0.7] }  // ✅ 30:70 ratio
{ "sizes": [300, 700] }   // ❌ pixel values — resolution dependent
```
