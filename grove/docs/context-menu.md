# Context Menu

Right-click context menu for sidebar items. Built on `@radix-ui/react-context-menu` with a shared wrapper that provides common actions across all sidebar item types.

## Architecture

```
SidebarContextMenu (wrapper)
├── extraItems?          — component-specific items (rendered first)
├── ContextMenuSeparator — auto-inserted when extraItems present
├── Open in Finder       → reveal_in_finder (platform command)
└── Open in Global Terminal → addGlobalTerminalTab({ cwd })
```

### Key Files

| File | Role |
|------|------|
| `src/components/ui/context-menu.tsx` | Radix primitive wrappers (base components) |
| `src/components/sidebar/SidebarContextMenu.tsx` | Shared wrapper with common menu items |
| `src/lib/platform/tauri.ts` · `electron.ts` | `revealInFinder()` platform command |
| `src-tauri/src/lib.rs` | `reveal_in_finder` Rust command |
| `src-electron/main.ts` | `reveal_in_finder` Electron handler |

### Applied To

| Component | Path source |
|-----------|-------------|
| `DefaultBranchItem` (SOT) | `project.sourcePath` |
| `WorktreeItem` | `worktree.path` |
| `MissionItem` | `mission.missionDir` |

## Extending

### Adding component-specific items

Pass `extraItems` to `SidebarContextMenu`. They render above common items with an automatic separator:

```tsx
<SidebarContextMenu
  path={worktree.path}
  extraItems={
    <>
      <ContextMenuItem onSelect={handleRename}>Rename</ContextMenuItem>
      <ContextMenuItem onSelect={handleRemove}>Remove</ContextMenuItem>
    </>
  }
>
  <SidebarLeafItem ... />
</SidebarContextMenu>
```

### Adding new common items

Add to `SidebarContextMenu.tsx` — all sidebar items get the new action automatically.

### SidebarLeafItem ref forwarding

`SidebarLeafItem` uses `forwardRef` so that `ContextMenuTrigger asChild` can attach to it. Any new leaf-style component used as a direct child of `SidebarContextMenu` must also forward refs.

## Global Terminal cwd

`GlobalTerminalTab` has an optional `cwd` field. When present, the PTY spawns with that directory instead of the default `baseDir`. This is used by the "Open in Global Terminal" action:

```ts
usePanelLayoutStore.getState().addGlobalTerminalTab({
  title: "my-branch",
  cwd: "/path/to/worktree",
});
```
