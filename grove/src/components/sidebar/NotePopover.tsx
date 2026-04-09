import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNoteStore } from "../../store/note";
import { overlay } from "../../lib/overlay";
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
    <NoteDialog noteKey={noteKey} label={label} onClose={close} />
  ));
}

// ── NoteDialog (flat inline style) ──

interface NoteDialogProps {
  noteKey: string;
  label: string;
  onClose: () => void;
}

function NoteDialog({ noteKey, label, onClose }: NoteDialogProps) {
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
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-[50%] left-[50%] z-50 w-full max-w-sm translate-x-[-50%] translate-y-[-50%]",
            "rounded-lg border border-border bg-popover shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <DialogPrimitive.Title className={cn("sr-only")}>{label}</DialogPrimitive.Title>
          <div className={cn("flex items-center justify-between px-3.5 pt-3 pb-1.5")}>
            <span className={cn("text-xs font-medium text-accent")}>{label}</span>
            <div className={cn("flex items-center gap-1")}>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center justify-center h-5 w-5 rounded-sm cursor-pointer",
                  "text-muted-foreground/60 hover:text-destructive transition-colors",
                )}
                onClick={handleDelete}
                title="Delete note"
              >
                <Trash2 className={cn("h-3 w-3")} />
              </button>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center justify-center h-5 w-5 rounded-sm cursor-pointer",
                    "text-muted-foreground/60 hover:text-foreground transition-colors",
                  )}
                >
                  <X className={cn("h-3.5 w-3.5")} />
                </button>
              </DialogPrimitive.Close>
            </div>
          </div>
          <div className={cn("px-3.5 pb-3.5")}>
            <textarea
              ref={textareaRef}
              className={cn(
                "min-h-[120px] w-full resize-y border-t border-border bg-transparent px-0 pt-2.5 text-xs leading-relaxed",
                "placeholder:text-muted-foreground/40 focus:outline-none",
              )}
              value={value}
              onChange={handleChange}
              placeholder="Write a note..."
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
