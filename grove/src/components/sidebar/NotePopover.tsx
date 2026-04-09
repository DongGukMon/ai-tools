import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useNoteStore } from "../../store/note";
import { overlay } from "../../lib/overlay";
import { Dialog } from "../ui/dialog";
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

// ── NoteEditorContent (for use inside Dialog/overlay) ──

interface NoteEditorContentProps {
  noteKey: string;
  onClose: () => void;
}

// ── NoteEmoji (clickable 📝 that opens note dialog) ──

interface NoteEmojiProps {
  noteKey: string;
  label: string;
}

export function NoteEmoji({ noteKey, label }: NoteEmojiProps) {
  const hasNote = useNoteStore((s) => s.hasNote(noteKey));
  if (!hasNote) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openNoteDialog(noteKey, label);
  };

  return (
    <button
      type="button"
      className={cn("ml-1 cursor-pointer")}
      onClick={handleClick}
      title="Open note"
    >
      📝
    </button>
  );
}

// ── Open note dialog helper ──

export function openNoteDialog(noteKey: string, label: string) {
  overlay.open<void>(({ close }) => (
    <Dialog open onClose={close} title={label} className="max-w-sm">
      <NoteEditorContent noteKey={noteKey} onClose={close} />
    </Dialog>
  ));
}

// ── NoteEditorContent ──

export function NoteEditorContent({ noteKey, onClose }: NoteEditorContentProps) {
  const note = useNoteStore((s) => s.getNote(noteKey));
  const saveNote = useNoteStore((s) => s.saveNote);
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const [value, setValue] = useState(note ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }
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
      <textarea
        ref={textareaRef}
        className={cn(
          "min-h-[120px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs leading-relaxed",
          "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring",
        )}
        value={value}
        onChange={handleChange}
        placeholder="Write a note..."
      />
      <div className={cn("flex justify-end")}>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center h-6 w-6 rounded-sm cursor-pointer text-muted-foreground hover:text-destructive transition-colors",
          )}
          onClick={handleDelete}
          title="Delete note"
        >
          <Trash2 className={cn("h-3.5 w-3.5")} />
        </button>
      </div>
    </div>
  );
}
