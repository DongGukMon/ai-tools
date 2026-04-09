import { useEffect, useRef, useState } from "react";
import { FileText, Trash2 } from "lucide-react";
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
        <button
          type="button"
          className={cn(
            "shrink-0 inline-flex items-center justify-center transition-colors",
            hasNote || open
              ? "text-amber-600 hover:text-amber-500"
              : "pointer-events-none w-0 overflow-hidden",
          )}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <FileText className={cn("h-[13px] w-[13px]")} />
        </button>
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
