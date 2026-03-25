import { useRef, useCallback } from "react";
import { useProjectStore } from "../../store/project";
import { useDiff } from "../../hooks/useDiff";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { useFileSelection } from "../../hooks/useFileSelection";
import { cn } from "../../lib/cn";
import ResizablePanelGroup from "../ui/resizable-panel-group";
import DiffViewer from "../diff/DiffViewer";
import type { FileStatus } from "../../types";
import { FileText, Plus, Minus, Undo2 } from "lucide-react";

function FileItem({
  file,
  index,
  selected,
  multiSelected,
  onSelect,
  onMultiSelectClick,
  onMultiSelectMouseDown,
  onMultiSelectMouseEnter,
  onMultiSelectMouseUp,
  actions,
}: {
  file: FileStatus;
  index: number;
  selected: boolean;
  multiSelected: boolean;
  onSelect: (path: string, staged: boolean) => void;
  onMultiSelectClick: (id: string, index: number, shiftKey: boolean) => void;
  onMultiSelectMouseDown: (id: string, index: number) => void;
  onMultiSelectMouseEnter: (id: string, index: number, buttons: number) => void;
  onMultiSelectMouseUp: () => void;
  actions?: React.ReactNode;
}) {
  const draggedRef = useRef(false);

  const statusColors: Record<string, string> = {
    modified: "text-yellow-400",
    added: "text-green-400",
    deleted: "text-red-400",
    renamed: "text-blue-400",
    untracked: "text-green-400",
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 w-full px-2 py-0.5 text-xs transition-colors cursor-pointer select-none",
        {
          "bg-accent text-accent-foreground": selected && !multiSelected,
          "bg-blue-500/10 text-foreground": multiSelected,
          "text-foreground hover:bg-muted": !selected && !multiSelected,
        },
      )}
      style={multiSelected ? { boxShadow: "inset 3px 0 0 rgba(88, 166, 255, 0.5)" } : undefined}
      onMouseDown={() => {
        draggedRef.current = false;
        onMultiSelectMouseDown(file.path, index);
      }}
      onMouseMove={() => {
        draggedRef.current = true;
      }}
      onMouseEnter={(e) => onMultiSelectMouseEnter(file.path, index, e.buttons)}
      onMouseUp={onMultiSelectMouseUp}
      onClick={(e) => {
        if (draggedRef.current) return;
        if (e.shiftKey) {
          onMultiSelectClick(file.path, index, true);
        } else {
          onSelect(file.path, file.staged);
        }
      }}
    >
      <FileText className={cn("size-3 shrink-0", statusColors[file.status])} />
      <span className={cn("truncate flex-1")}>{file.path}</span>
      <span
        className={cn(
          "shrink-0 text-[10px] uppercase font-medium",
          statusColors[file.status],
        )}
      >
        {file.status[0]}
      </span>
      {actions && (
        <div
          className={cn(
            "flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
          )}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  title,
  onClick,
}: {
  icon: typeof Plus;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
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

function FileSection({
  title,
  files,
  selectedFile,
  onSelect,
  renderActions,
  selection,
}: {
  title: string;
  files: FileStatus[];
  selectedFile: string | null;
  onSelect: (path: string, staged: boolean) => void;
  renderActions?: (file: FileStatus) => React.ReactNode;
  selection: ReturnType<typeof useFileSelection>;
}) {
  return (
    <div className={cn("flex flex-col min-h-0")}>
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
          {files.length}
        </span>
      </div>
      <div className={cn("flex-1 overflow-y-auto")}>
        {files.map((file, index) => (
          <FileItem
            key={`${file.staged ? "s" : "u"}:${file.path}`}
            file={file}
            index={index}
            selected={file.path === selectedFile}
            multiSelected={selection.isSelected(file.path)}
            onSelect={onSelect}
            onMultiSelectClick={selection.handleClick}
            onMultiSelectMouseDown={selection.handleMouseDown}
            onMultiSelectMouseEnter={selection.handleMouseEnter}
            onMultiSelectMouseUp={selection.handleMouseUp}
            actions={renderActions?.(file)}
          />
        ))}
      </div>
    </div>
  );
}

function BatchActionBar({
  count,
  actions,
}: {
  count: number;
  actions: { label: string; onClick: () => void; variant?: "danger" }[];
}) {
  if (count < 2) return null;
  return (
    <div className={cn("flex items-center justify-between px-2 py-1 border-t border-blue-500/20 bg-blue-500/5")}>
      <span className={cn("text-[11px] text-blue-400")}>{count} files selected</span>
      <div className={cn("flex gap-1")}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className={cn("px-2 py-0.5 text-[10px] rounded border transition-colors", {
              "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20": !a.variant,
              "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20": a.variant === "danger",
            })}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Working changes view: Staged/Unstaged split with git actions */
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

  const stagedSelection = useFileSelection(staged, (f) => f.path);
  const unstagedSelection = useFileSelection(unstaged, (f) => f.path);

  const batchAction = useCallback(
    async (
      action: (path: string) => Promise<void>,
      selection: ReturnType<typeof useFileSelection>,
    ) => {
      const paths = [...selection.selectedIds];
      selection.clearSelection();
      for (const path of paths) {
        await action(path);
      }
    },
    [],
  );

  return (
    <ResizablePanelGroup className={cn("h-full")} ratios={ratios} onCommit={onCommit}>
      <ResizablePanelGroup.Pane minSize={160}>
        <div className={cn("flex flex-col h-full bg-sidebar overflow-hidden")}>
          <div
            className={cn("flex-1 flex flex-col min-h-0")}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === " " && stagedSelection.selectedIds.size > 0) {
                e.preventDefault();
                batchAction(store.unstageFile, stagedSelection);
              }
              if (e.key === "Escape") stagedSelection.clearSelection();
            }}
          >
            <FileSection
              title="Staged"
              files={staged}
              selectedFile={store.selectedFile}
              onSelect={store.selectFile}
              selection={stagedSelection}
              renderActions={(file) => (
                <ActionButton
                  icon={Minus}
                  title="Unstage"
                  onClick={() => store.unstageFile(file.path)}
                />
              )}
            />
            <BatchActionBar
              count={stagedSelection.selectedIds.size}
              actions={[{ label: "Unstage Selected", onClick: () => batchAction(store.unstageFile, stagedSelection) }]}
            />
          </div>
          <div
            className={cn("flex-1 flex flex-col min-h-0 border-t border-border")}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === " " && unstagedSelection.selectedIds.size > 0) {
                e.preventDefault();
                batchAction(store.stageFile, unstagedSelection);
              }
              if (e.key === "Escape") unstagedSelection.clearSelection();
            }}
          >
            <FileSection
              title="Unstaged"
              files={unstaged}
              selectedFile={store.selectedFile}
              onSelect={store.selectFile}
              selection={unstagedSelection}
              renderActions={(file) => (
                <>
                  <ActionButton
                    icon={Plus}
                    title="Stage"
                    onClick={() => store.stageFile(file.path)}
                  />
                  <ActionButton
                    icon={Undo2}
                    title="Discard changes"
                    onClick={() => store.discardFile(file.path)}
                  />
                </>
              )}
            />
            <BatchActionBar
              count={unstagedSelection.selectedIds.size}
              actions={[
                { label: "Stage Selected", onClick: () => batchAction(store.stageFile, unstagedSelection) },
                { label: "Discard Selected", onClick: () => batchAction(store.discardFile, unstagedSelection), variant: "danger" },
              ]}
            />
          </div>
        </div>
      </ResizablePanelGroup.Pane>
      <ResizablePanelGroup.Pane minSize={200}>
        <DiffViewer diffs={store.currentDiff ? [store.currentDiff] : []} isStaged={store.isViewingStaged} />
      </ResizablePanelGroup.Pane>
    </ResizablePanelGroup>
  );
}

/** Commit view: flat file list (no staged/unstaged, no git actions) */
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

  // CommitChangesView is read-only — no multi-select needed, but FileSection requires selection prop
  // Use a no-op selection object to satisfy the interface without enabling multi-select behavior
  const noopSelection: ReturnType<typeof useFileSelection> = {
    selectedIds: new Set(),
    isSelected: () => false,
    handleClick: () => {},
    handleMouseDown: () => {},
    handleMouseEnter: () => {},
    handleMouseUp: () => {},
    clearSelection: () => {},
  };

  return (
    <ResizablePanelGroup className={cn("h-full")} ratios={ratios} onCommit={onCommit}>
      <ResizablePanelGroup.Pane minSize={160}>
        <div className={cn("flex flex-col h-full bg-sidebar overflow-hidden")}>
          <FileSection
            title="Files"
            files={files}
            selectedFile={store.selectedFile}
            onSelect={store.selectFile}
            selection={noopSelection}
          />
        </div>
      </ResizablePanelGroup.Pane>
      <ResizablePanelGroup.Pane minSize={200}>
        <DiffViewer diffs={store.currentDiff ? [store.currentDiff] : store.commitDiffs} isStaged={false} isCommitView />
      </ResizablePanelGroup.Pane>
    </ResizablePanelGroup>
  );
}

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
