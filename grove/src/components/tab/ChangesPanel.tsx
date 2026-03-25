import { useState, useEffect, useCallback, useRef } from "react";
import { useProjectStore } from "../../store/project";
import { useDiffStore } from "../../store/diff";
import { useDiff } from "../../hooks/useDiff";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { cn } from "../../lib/cn";
import { runCommandSafely } from "../../lib/command";
import * as tauri from "../../lib/platform";
import ResizablePanelGroup from "../ui/resizable-panel-group";
import DiffViewer from "../diff/DiffViewer";
import type { FileStatus, FileDiff } from "../../types";
import { FileText, Plus, Minus, Undo2 } from "lucide-react";
import { useMarqueeSelection } from "../../hooks/useMarqueeSelection";

// ── FileItem ──

function FileItem({
  file,
  selected,
  onClick,
  actions,
}: {
  file: FileStatus;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  actions?: React.ReactNode;
}) {
  const statusColors: Record<string, string> = {
    modified: "text-yellow-400",
    added: "text-green-400",
    deleted: "text-red-400",
    renamed: "text-blue-400",
    untracked: "text-green-400",
  };

  return (
    <div
      data-file-item
      className={cn(
        "group flex items-center gap-1.5 w-full px-2 py-0.5 text-xs transition-colors cursor-pointer select-none",
        {
          "text-foreground": selected,
          "text-muted-foreground hover:bg-muted": !selected,
        },
      )}
      style={selected ? {
        background: "rgba(99, 163, 255, 0.08)",
        borderLeft: "2px solid rgba(99, 163, 255, 0.5)",
      } : { borderLeft: "2px solid transparent" }}
      onClick={onClick}
    >
      <FileText className={cn("size-3 shrink-0", statusColors[file.status])} />
      <span className={cn("truncate flex-1")}>{file.path}</span>
      {actions && (
        <div className={cn("flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100")}>
          {actions}
        </div>
      )}
      <span
        className={cn(
          "shrink-0 text-[10px] uppercase font-medium",
          statusColors[file.status],
        )}
      >
        {file.status[0]}
      </span>
    </div>
  );
}

// ── ActionButton ──

function ActionButton({
  icon: Icon,
  title,
  onClick,
  confirm: confirmMsg,
}: {
  icon: typeof Plus;
  title: string;
  onClick: () => void;
  confirm?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        onClick();
      }}
      className={cn(
        "flex items-center justify-center size-4 rounded-sm hover:bg-foreground/10 transition-colors",
      )}
    >
      <Icon className={cn("size-3")} />
    </button>
  );
}

// ── FileSection ──

function FileSection({
  title,
  files,
  selectedPaths,
  onSelectFile,
  onMarqueeSelect,
  renderActions,
}: {
  title: string;
  files: FileStatus[];
  selectedPaths: Set<string>;
  onSelectFile: (path: string, shiftKey: boolean) => void;
  onMarqueeSelect?: (ids: Set<string>) => void;
  renderActions?: (file: FileStatus) => React.ReactNode;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const itemRefsMap = useRef<Map<string, HTMLElement>>(new Map());
  const noop = useCallback(() => {}, []);
  const marquee = useMarqueeSelection(sectionRef, itemRefsMap, onMarqueeSelect ?? noop);

  return (
    <div className={cn("flex flex-col min-h-0 flex-1")}>
      <div
        className={cn(
          "flex items-center gap-2 px-2 h-7 shrink-0 border-b border-border",
        )}
      >
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent",
          )}
        >
          {selectedPaths.size > 0 ? `${selectedPaths.size}/${files.length}` : files.length}
        </span>
      </div>
      <div
        ref={sectionRef}
        className={cn("flex-1 min-h-0 overflow-y-auto relative select-none cursor-default")}
        {...marquee.handlers}
      >
        {files.map((file) => (
          <div
            key={file.path}
            ref={(el) => {
              if (el) itemRefsMap.current.set(file.path, el);
              else itemRefsMap.current.delete(file.path);
            }}
          >
            <FileItem
              file={file}
              selected={selectedPaths.has(file.path)}
              onClick={(e) => onSelectFile(file.path, e.shiftKey)}
              actions={renderActions?.(file)}
            />
          </div>
        ))}
        {marquee.rect && (
          <div
            className={cn("absolute pointer-events-none z-10")}
            style={{
              left: marquee.rect.x,
              top: marquee.rect.y,
              width: marquee.rect.width,
              height: marquee.rect.height,
              border: "1px solid rgba(99, 163, 255, 0.5)",
              background: "rgba(99, 163, 255, 0.06)",
              borderRadius: 2,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── WorkingChangesView ──

function WorkingChangesView({
  store,
  ratios,
  onCommit,
}: {
  store: ReturnType<typeof useDiff>;
  ratios: number[];
  onCommit: (ratios: number[]) => void;
}) {
  const staged = store.fileStatuses.filter((f) => f.staged);
  const unstaged = store.fileStatuses.filter((f) => !f.staged);

  // Local selection state
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [selectedSection, setSelectedSection] = useState<"staged" | "unstaged">("unstaged");
  const lastClickedRef = useRef<{ section: "staged" | "unstaged"; path: string } | null>(null);

  // Multi-file diffs loaded at component level
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const worktreePath = store.worktreePath;
  const clearLineSelection = useDiffStore((s) => s.clearSelection);

  // Load diffs for selected files — also re-fires when fileStatuses change (after mutations)
  const fileStatuses = store.fileStatuses;
  useEffect(() => {
    if (selectedPaths.size === 0 || !worktreePath) {
      setDiffs([]);
      return;
    }

    let cancelled = false;
    const isStaged = selectedSection === "staged";
    const paths = [...selectedPaths];

    Promise.all(
      paths.map((path) => {
        const queryPath = isStaged ? `staged:${path}` : path;
        return runCommandSafely(() => tauri.getWorkingDiff(worktreePath, queryPath), {
          errorToast: false,
        });
      }),
    ).then((results) => {
      if (cancelled) return;
      setDiffs(results.filter((d): d is FileDiff => d !== null));
    });

    return () => { cancelled = true; };
  }, [selectedPaths, selectedSection, worktreePath, fileStatuses]);

  // Clear line selection when file selection or section changes
  useEffect(() => {
    clearLineSelection();
  }, [selectedPaths, selectedSection, clearLineSelection]);

  // Selection handler
  const handleSelectFile = useCallback(
    (section: "staged" | "unstaged", files: FileStatus[], path: string, shiftKey: boolean) => {
      if (shiftKey && lastClickedRef.current?.section === section) {
        const lastPath = lastClickedRef.current.path;
        const lastIdx = files.findIndex((f) => f.path === lastPath);
        const curIdx = files.findIndex((f) => f.path === path);
        if (lastIdx >= 0 && curIdx >= 0) {
          const min = Math.min(lastIdx, curIdx);
          const max = Math.max(lastIdx, curIdx);
          const next = new Set<string>();
          for (let i = min; i <= max; i++) {
            next.add(files[i].path);
          }
          setSelectedPaths(next);
          setSelectedSection(section);
          return;
        }
      }
      setSelectedPaths(new Set([path]));
      setSelectedSection(section);
      lastClickedRef.current = { section, path };
    },
    [],
  );

  const isStaged = selectedSection === "staged";

  const handleMarqueeSelect = useCallback(
    (section: "staged" | "unstaged", ids: Set<string>) => {
      setSelectedPaths(ids);
      setSelectedSection(section);
    },
    [],
  );

  // Keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " " && selectedPaths.size > 0) {
        e.preventDefault();
        const action = isStaged ? store.unstageFile : store.stageFile;
        const paths = [...selectedPaths];
        setSelectedPaths(new Set());
        (async () => {
          for (const path of paths) {
            await action(path);
          }
        })();
      }
      if (e.key === "Escape") {
        setSelectedPaths(new Set());
      }
    },
    [selectedPaths, isStaged, store],
  );

  const fileListRef = useRef<HTMLDivElement>(null);

  // Auto-focus file list when selection changes so keyboard shortcuts work
  useEffect(() => {
    if (selectedPaths.size > 0) {
      fileListRef.current?.focus();
    }
  }, [selectedPaths]);

  return (
    <ResizablePanelGroup className={cn("h-full")} ratios={ratios} onCommit={onCommit}>
      <ResizablePanelGroup.Pane minSize={160}>
        <div
          ref={fileListRef}
          className={cn("flex flex-col h-full bg-sidebar overflow-hidden outline-none")}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div className={cn("flex-1 flex flex-col min-h-0")}>
            <FileSection
              title="Staged"
              files={staged}
              selectedPaths={selectedSection === "staged" ? selectedPaths : new Set()}
              onSelectFile={(path, shiftKey) => handleSelectFile("staged", staged, path, shiftKey)}
              onMarqueeSelect={(ids) => handleMarqueeSelect("staged", ids)}
              renderActions={(file) => (
                <ActionButton icon={Minus} title="Unstage" onClick={() => store.unstageFile(file.path)} />
              )}
            />
          </div>
          <div className={cn("flex-1 flex flex-col min-h-0 border-t border-border")}>
            <FileSection
              title="Unstaged"
              files={unstaged}
              selectedPaths={selectedSection === "unstaged" ? selectedPaths : new Set()}
              onSelectFile={(path, shiftKey) => handleSelectFile("unstaged", unstaged, path, shiftKey)}
              onMarqueeSelect={(ids) => handleMarqueeSelect("unstaged", ids)}
              renderActions={(file) => (
                <>
                  <ActionButton icon={Plus} title="Stage" onClick={() => store.stageFile(file.path)} />
                  <ActionButton icon={Undo2} title="Discard" onClick={() => store.discardFile(file.path)} confirm="Discard all changes to this file?" />
                </>
              )}
            />
          </div>
        </div>
      </ResizablePanelGroup.Pane>
      <ResizablePanelGroup.Pane minSize={200}>
        <DiffViewer diffs={diffs} isStaged={isStaged} />
      </ResizablePanelGroup.Pane>
    </ResizablePanelGroup>
  );
}

// ── CommitChangesView ──

function CommitChangesView({
  store,
  ratios,
  onCommit,
}: {
  store: ReturnType<typeof useDiff>;
  ratios: number[];
  onCommit: (ratios: number[]) => void;
}) {
  const files: FileStatus[] = store.commitDiffs.map((d) => ({
    path: d.path,
    status: d.status as FileStatus["status"],
    staged: false,
  }));

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  return (
    <ResizablePanelGroup className={cn("h-full")} ratios={ratios} onCommit={onCommit}>
      <ResizablePanelGroup.Pane minSize={160}>
        <div className={cn("flex flex-col h-full bg-sidebar overflow-hidden")}>
          <FileSection
            title="Files"
            files={files}
            selectedPaths={selectedPaths}
            onSelectFile={(path) => {
              setSelectedPaths(new Set([path]));
              store.selectFile(path);
            }}
          />
        </div>
      </ResizablePanelGroup.Pane>
      <ResizablePanelGroup.Pane minSize={200}>
        <DiffViewer diffs={store.currentDiff ? [store.currentDiff] : store.commitDiffs} isStaged={false} isCommitView />
      </ResizablePanelGroup.Pane>
    </ResizablePanelGroup>
  );
}

// ── ChangesPanel ──

export default function ChangesPanel() {
  const selectedWorktree = useProjectStore((s) => s.selectedWorktree);
  const store = useDiff(selectedWorktree?.path ?? null);

  if (!selectedWorktree) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full text-sm text-muted-foreground",
        )}
      >
        Select a worktree to view changes
      </div>
    );
  }

  const changesSizes = usePanelLayoutStore((s) => s.changes);
  const updateChanges = usePanelLayoutStore((s) => s.updateChanges);

  if (store.selectedView === "changes") {
    return <WorkingChangesView store={store} ratios={changesSizes} onCommit={updateChanges} />;
  }

  return <CommitChangesView store={store} ratios={changesSizes} onCommit={updateChanges} />;
}
