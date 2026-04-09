# Note Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-item sticky notes to sidebar context menu targets (SOT, Worktree, Mission) with auto-save popover UI and note indicator icons.

**Architecture:** JSON file persistence (`~/.grove/notes.json`) via grove-core Rust backend, exposed through Tauri commands, consumed by a Zustand store. UI is a Radix Popover triggered from either a note icon click or context menu selection.

**Tech Stack:** Rust (serde, grove-core), Tauri commands, React 19, Zustand 5, Radix Popover, Lucide icons, Tailwind CSS v4

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `grove-core/src/note.rs` | NoteStore struct, load/save/delete persistence |
| Modify | `grove-core/src/lib.rs:1-15` | Add `pub mod note;` |
| Modify | `src-tauri/src/lib.rs:286-320,562-644` | Add note commands + register |
| Modify | `src/lib/platform/tauri.ts:526-562` | Add listNotes/saveNote/deleteNote wrappers |
| Modify | `src/lib/platform/electron.ts` | Mirror tauri.ts note wrappers |
| Create | `src/store/note.ts` | useNoteStore Zustand store |
| Modify | `src/App.tsx:35` | Add noteStore.init() |
| Create | `src/components/ui/popover.tsx` | Radix Popover primitive wrappers |
| Create | `src/components/sidebar/NotePopover.tsx` | NoteIndicator + NoteEditor components |
| Modify | `src/components/sidebar/SidebarContextMenu.tsx:21-88` | Add noteKey prop + "Note" menu item |
| Modify | `src/components/sidebar/DefaultBranchItem.tsx:87-91` | Add NoteIndicator to label |
| Modify | `src/components/sidebar/WorktreeItem.tsx:111` | Add NoteIndicator to label |
| Modify | `src/components/sidebar/MissionItem.tsx:91-97` | Add NoteIndicator to name area |

---

### Task 1: Rust Backend — Note Persistence

**Files:**
- Create: `grove-core/src/note.rs`
- Modify: `grove-core/src/lib.rs:1-15`

- [ ] **Step 1: Create `grove-core/src/note.rs`**

```rust
use crate::config::{grove_data_path, load_json_file_or_default, save_json_file};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NoteStore {
    #[serde(default)]
    pub notes: HashMap<String, String>,
}

fn notes_path() -> Result<PathBuf, String> {
    grove_data_path("notes.json")
}

pub fn load_notes() -> Result<NoteStore, String> {
    let path = notes_path()?;
    load_json_file_or_default(&path)
}

pub fn save_note(key: &str, content: &str) -> Result<(), String> {
    let path = notes_path()?;
    let mut store: NoteStore = load_json_file_or_default(&path)?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        store.notes.remove(key);
    } else {
        store.notes.insert(key.to_string(), content.to_string());
    }
    save_json_file(&path, &store)
}

pub fn delete_note(key: &str) -> Result<(), String> {
    let path = notes_path()?;
    let mut store: NoteStore = load_json_file_or_default(&path)?;
    store.notes.remove(key);
    save_json_file(&path, &store)
}
```

- [ ] **Step 2: Register module in `grove-core/src/lib.rs`**

Add after line 7 (`pub mod mission;`):

```rust
pub mod note;
```

- [ ] **Step 3: Verify build**

Run: `cd grove && cargo check -p grove-core`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add grove-core/src/note.rs grove-core/src/lib.rs
git commit -m "feat(note): add grove-core note persistence module"
```

---

### Task 2: Tauri Commands

**Files:**
- Modify: `src-tauri/src/lib.rs:320,607`

- [ ] **Step 1: Add note command functions**

Add after line 320 (after `remove_project_from_mission` command), before `open_external`:

```rust
// === NOTE COMMANDS ===

#[tauri::command]
async fn list_notes() -> Result<std::collections::HashMap<String, String>, String> {
    blocking(|| Ok(grove_core::note::load_notes()?.notes)).await
}

#[tauri::command]
async fn save_note(key: String, content: String) -> Result<(), String> {
    blocking(move || grove_core::note::save_note(&key, &content)).await
}

#[tauri::command]
async fn delete_note(key: String) -> Result<(), String> {
    blocking(move || grove_core::note::delete_note(&key)).await
}
```

- [ ] **Step 2: Register commands in invoke_handler**

In the `tauri::generate_handler!` macro (around line 607, after `remove_project_from_mission`), add:

```rust
            // Note
            list_notes,
            save_note,
            delete_note,
```

- [ ] **Step 3: Verify build**

Run: `cd grove && cargo check -p grove-app`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(note): add Tauri note commands"
```

---

### Task 3: Platform Abstraction

**Files:**
- Modify: `src/lib/platform/tauri.ts:562`
- Modify: `src/lib/platform/electron.ts`

- [ ] **Step 1: Add note functions to `tauri.ts`**

Add after line 562 (after the mission commands section, before the buddy commands section):

```typescript
// === NOTE COMMANDS ===

export async function listNotes(): Promise<Record<string, string>> {
  return platform.invoke<Record<string, string>>("list_notes");
}

export async function saveNote(key: string, content: string): Promise<void> {
  return platform.invoke("save_note", { key, content });
}

export async function deleteNote(key: string): Promise<void> {
  return platform.invoke("delete_note", { key });
}
```

- [ ] **Step 2: Add note functions to `electron.ts`**

Add the same three functions in the same location relative to the buddy commands section. The function signatures are identical — `electron.ts` uses the same `platform.invoke` pattern:

```typescript
// === NOTE COMMANDS ===

export async function listNotes(): Promise<Record<string, string>> {
  return platform.invoke<Record<string, string>>("list_notes");
}

export async function saveNote(key: string, content: string): Promise<void> {
  return platform.invoke("save_note", { key, content });
}

export async function deleteNote(key: string): Promise<void> {
  return platform.invoke("delete_note", { key });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/platform/tauri.ts src/lib/platform/electron.ts
git commit -m "feat(note): add platform note command wrappers"
```

---

### Task 4: Zustand Store

**Files:**
- Create: `src/store/note.ts`
- Modify: `src/App.tsx:35`

- [ ] **Step 1: Create `src/store/note.ts`**

```typescript
import { create } from "zustand";
import * as platform from "../lib/platform";
import { runCommandSafely } from "../lib/command";

interface NoteState {
  notes: Record<string, string>;
  activeNoteKey: string | null;

  init: () => Promise<void>;
  saveNote: (key: string, content: string) => void;
  deleteNote: (key: string) => void;
  getNote: (key: string) => string | undefined;
  hasNote: (key: string) => boolean;
  setActiveNoteKey: (key: string | null) => void;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedSaveToBackend(key: string, content: string) {
  const existing = saveTimers.get(key);
  if (existing) clearTimeout(existing);
  saveTimers.set(
    key,
    setTimeout(() => {
      saveTimers.delete(key);
      platform.saveNote(key, content).catch(() => {});
    }, 500),
  );
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: {},
  activeNoteKey: null,

  init: async () => {
    const notes = await runCommandSafely(() => platform.listNotes(), {
      errorToast: "Failed to load notes",
    });
    if (notes) {
      set({ notes });
    }
  },

  saveNote: (key: string, content: string) => {
    const trimmed = content.trim();
    set((state) => {
      const next = { ...state.notes };
      if (trimmed.length === 0) {
        delete next[key];
      } else {
        next[key] = content;
      }
      return { notes: next };
    });
    debouncedSaveToBackend(key, content);
  },

  deleteNote: (key: string) => {
    set((state) => {
      const next = { ...state.notes };
      delete next[key];
      return { notes: next };
    });
    platform.deleteNote(key).catch(() => {});
  },

  getNote: (key: string) => get().notes[key],
  hasNote: (key: string) => {
    const note = get().notes[key];
    return note !== undefined && note.trim().length > 0;
  },

  setActiveNoteKey: (key: string | null) => set({ activeNoteKey: key }),
}));
```

- [ ] **Step 2: Add init() call in `src/App.tsx`**

Add import at top of file (after existing store imports around line 9):

```typescript
import { useNoteStore } from "./store/note";
```

Add init call after line 35 (after `usePreferencesStore.getState().init()`):

```typescript
useEffect(() => { useNoteStore.getState().init(); }, []);
```

- [ ] **Step 3: Verify dev server starts**

Run: `cd grove && pnpm tauri dev`
Expected: app starts, no console errors related to notes

- [ ] **Step 4: Commit**

```bash
git add src/store/note.ts src/App.tsx
git commit -m "feat(note): add useNoteStore with debounced persistence"
```

---

### Task 5: Radix Popover Setup

**Files:**
- Create: `src/components/ui/popover.tsx`

- [ ] **Step 1: Install `@radix-ui/react-popover`**

Run: `cd grove && pnpm add @radix-ui/react-popover`

- [ ] **Step 2: Create `src/components/ui/popover.tsx`**

Follow the same wrapper pattern as `src/components/ui/context-menu.tsx`:

```typescript
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef } from "react";
import { cn } from "../../lib/cn";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;

const PopoverContent = forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverClose, PopoverContent };
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/popover.tsx
git commit -m "feat(note): add Radix Popover UI primitive"
```

---

### Task 6: NotePopover Component

**Files:**
- Create: `src/components/sidebar/NotePopover.tsx`

- [ ] **Step 1: Create `src/components/sidebar/NotePopover.tsx`**

```typescript
import { useEffect, useRef, useState } from "react";
import { StickyNote, Trash2 } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";
import { useNoteStore } from "../../store/note";
import { cn } from "../../lib/cn";

// ── Note key helpers ──

type NoteTarget =
  | { type: "sot"; projectId: string }
  | { type: "worktree"; projectId: string; worktreeName: string }
  | { type: "mission"; missionId: string };

export function getNoteKey(target: NoteTarget): string {
  switch (target.type) {
    case "sot":
      return `project::${target.projectId}::sot`;
    case "worktree":
      return `project::${target.projectId}::worktree::${target.worktreeName}`;
    case "mission":
      return `mission::${target.missionId}`;
  }
}

// ── NoteIndicator ──

interface NoteIndicatorProps {
  noteKey: string;
  label: string;
}

export function NoteIndicator({ noteKey, label }: NoteIndicatorProps) {
  const hasNote = useNoteStore((s) => s.hasNote(noteKey));
  const activeNoteKey = useNoteStore((s) => s.activeNoteKey);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (activeNoteKey === noteKey) {
      setOpen(true);
      useNoteStore.getState().setActiveNoteKey(null);
    }
  }, [activeNoteKey, noteKey]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span className={cn("inline-flex shrink-0 items-center")}>
          {hasNote && (
            <button
              type="button"
              className={cn(
                "ml-1 inline-flex items-center text-yellow-500/80 hover:text-yellow-500 transition-colors",
              )}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
            >
              <StickyNote className={cn("h-3 w-3")} />
            </button>
          )}
        </span>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        className={cn("w-72")}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <NoteEditor noteKey={noteKey} label={label} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

// ── NoteEditor ──

interface NoteEditorProps {
  noteKey: string;
  label: string;
  onClose: () => void;
}

function NoteEditor({ noteKey, label, onClose }: NoteEditorProps) {
  const note = useNoteStore((s) => s.getNote(noteKey));
  const saveNote = useNoteStore((s) => s.saveNote);
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const [value, setValue] = useState(note ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setValue(next);
    saveNote(noteKey, next);
  };

  const handleDelete = () => {
    deleteNote(noteKey);
    onClose();
  };

  return (
    <div className={cn("flex flex-col gap-2")}>
      <div className={cn("flex items-center justify-between")}>
        <span className={cn("text-xs font-medium text-muted-foreground truncate")}>
          {label}
        </span>
        <button
          type="button"
          className={cn(
            "h-5 w-5 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-destructive transition-colors",
          )}
          onClick={handleDelete}
          title="Delete note"
        >
          <Trash2 className={cn("h-3 w-3")} />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className={cn(
          "min-h-[80px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs leading-relaxed",
          "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring",
        )}
        value={value}
        onChange={handleChange}
        placeholder="Write a note..."
      />
      <span className={cn("text-[10px] text-muted-foreground/60")}>Auto-saved</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sidebar/NotePopover.tsx
git commit -m "feat(note): add NoteIndicator and NoteEditor components"
```

---

### Task 7: Context Menu Integration

**Files:**
- Modify: `src/components/sidebar/SidebarContextMenu.tsx:1-88`

- [ ] **Step 1: Add noteKey prop and "Note" menu item**

Add import at top (after existing imports):

```typescript
import { StickyNote } from "lucide-react";
import { useNoteStore } from "../../store/note";
```

Update the interface (line 21-25):

```typescript
interface SidebarContextMenuProps {
  path: string;
  children: ReactNode;
  extraItems?: ReactNode;
  noteKey?: string;
}
```

Update the destructuring (line 27):

```typescript
function SidebarContextMenu({ path, children, extraItems, noteKey }: SidebarContextMenuProps) {
```

Add handler inside the component (after `handleOpenInGlobalTerminal`, around line 49):

```typescript
  const handleOpenNote = () => {
    if (noteKey) {
      useNoteStore.getState().setActiveNoteKey(noteKey);
    }
  };
```

Add "Note" menu item after "Open in Global Terminal" (after line 66, before ideMenuItems separator):

```typescript
        {noteKey && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={handleOpenNote}>
              <StickyNote className={cn("mr-1.5 h-3.5 w-3.5")} />
              Note
            </ContextMenuItem>
          </>
        )}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sidebar/SidebarContextMenu.tsx
git commit -m "feat(note): add Note item to sidebar context menu"
```

---

### Task 8: Sidebar Item Integration

**Files:**
- Modify: `src/components/sidebar/DefaultBranchItem.tsx:12,76-91`
- Modify: `src/components/sidebar/WorktreeItem.tsx:17,103-132`
- Modify: `src/components/sidebar/MissionItem.tsx:18,64-97`

- [ ] **Step 1: DefaultBranchItem — add NoteIndicator**

Add import (after line 12, after `SidebarContextMenu`):

```typescript
import { getNoteKey, NoteIndicator } from "./NotePopover";
```

Add noteKey computation inside the component (after line 36, after `aiSessions`):

```typescript
  const noteKey = getNoteKey({ type: "sot", projectId: project.id });
```

Pass `noteKey` to `SidebarContextMenu` (line 78):

```typescript
      <SidebarContextMenu path={project.sourcePath} noteKey={noteKey}>
```

Update the `label` prop (lines 87-91) to include NoteIndicator:

```typescript
          label={
            <span className={cn("min-w-0 flex-1 truncate")}>
              {displayBranch}
              <span className={cn("ml-1 text-muted-foreground/60")}>{branchLabel}</span>
              <NoteIndicator noteKey={noteKey} label={`${project.repo} (SOT)`} />
            </span>
          }
```

- [ ] **Step 2: WorktreeItem — add NoteIndicator**

Add import (after line 17, after `SidebarContextMenu`):

```typescript
import { getNoteKey, NoteIndicator } from "./NotePopover";
```

Add noteKey computation inside the component (after line 71, after `displayName`):

```typescript
  const noteKey = getNoteKey({ type: "worktree", projectId, worktreeName: worktree.name });
```

Pass `noteKey` to `SidebarContextMenu` (line 104):

```typescript
    <SidebarContextMenu path={worktree.path} noteKey={noteKey}>
```

Update the `label` prop (line 111) to include NoteIndicator. Currently `label` is just a string `displayName`, change it to:

```typescript
        label={
          <span className={cn("min-w-0 flex-1 truncate")}>
            {displayName}
            <NoteIndicator noteKey={noteKey} label={displayName} />
          </span>
        }
```

Add `cn` import if not already present (it is at line 8).

- [ ] **Step 3: MissionItem — add NoteIndicator**

Add import (after line 18, after `SidebarContextMenu`):

```typescript
import { getNoteKey, NoteIndicator } from "./NotePopover";
```

Add noteKey computation inside the component (after line 34, after `showAddProject` state):

```typescript
  const noteKey = getNoteKey({ type: "mission", missionId: mission.id });
```

Pass `noteKey` to `SidebarContextMenu` (line 65):

```typescript
    <SidebarContextMenu path={mission.missionDir} noteKey={noteKey}>
```

Add NoteIndicator after the mission name span (after line 97, after `{mission.name}</span>`):

```typescript
        <NoteIndicator noteKey={noteKey} label={mission.name} />
```

- [ ] **Step 4: Verify end-to-end in dev mode**

Run: `cd grove && pnpm tauri dev`

Test flow:
1. Right-click a SOT item → "Note" appears in context menu → click → popover opens with empty textarea
2. Type text → close popover → note icon appears next to name
3. Click note icon → popover reopens with saved text
4. Delete via trash button → icon disappears
5. Repeat for worktree and mission items

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/DefaultBranchItem.tsx src/components/sidebar/WorktreeItem.tsx src/components/sidebar/MissionItem.tsx
git commit -m "feat(note): integrate NoteIndicator into sidebar items"
```
