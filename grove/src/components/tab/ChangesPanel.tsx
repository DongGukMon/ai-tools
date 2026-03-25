import { useProjectStore } from "../../store/project";
import { useDiff } from "../../hooks/useDiff";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { cn } from "../../lib/cn";
import ResizablePanelGroup from "../ui/resizable-panel-group";
import DiffViewer from "../diff/DiffViewer";
import type { FileStatus } from "../../types";
import { FileText, Plus, Minus, Undo2 } from "lucide-react";

function FileItem({
  file,
  selected,
  onSelect,
  actions,
}: {
  file: FileStatus;
  selected: boolean;
  onSelect: (path: string, staged: boolean) => void;
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
      className={cn(
        "group flex items-center gap-1.5 w-full px-2 py-0.5 text-xs transition-colors cursor-pointer",
        {
          "bg-accent text-accent-foreground": selected,
          "text-foreground hover:bg-muted": !selected,
        },
      )}
      onClick={() => onSelect(file.path, file.staged)}
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
}: {
  title: string;
  files: FileStatus[];
  selectedFile: string | null;
  onSelect: (path: string, staged: boolean) => void;
  renderActions?: (file: FileStatus) => React.ReactNode;
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
        {files.map((file) => (
          <FileItem
            key={`${file.staged ? "s" : "u"}:${file.path}`}
            file={file}
            selected={file.path === selectedFile}
            onSelect={onSelect}
            actions={renderActions?.(file)}
          />
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

  return (
    <ResizablePanelGroup className={cn("h-full")} ratios={ratios} onCommit={onCommit}>
      <ResizablePanelGroup.Pane minSize={160}>
        <div className={cn("flex flex-col h-full bg-sidebar overflow-hidden")}>
          <div className={cn("flex-1 flex flex-col min-h-0")}>
            <FileSection
              title="Staged"
              files={staged}
              selectedFile={store.selectedFile}
              onSelect={store.selectFile}
              renderActions={(file) => (
                <ActionButton
                  icon={Minus}
                  title="Unstage"
                  onClick={() => store.unstageFile(file.path)}
                />
              )}
            />
          </div>
          <div className={cn("flex-1 flex flex-col min-h-0 border-t border-border")}>
            <FileSection
              title="Unstaged"
              files={unstaged}
              selectedFile={store.selectedFile}
              onSelect={store.selectFile}
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
          </div>
        </div>
      </ResizablePanelGroup.Pane>
      <ResizablePanelGroup.Pane minSize={200}>
        <DiffViewer diff={store.currentDiff} selectedFile={store.selectedFile} isStaged={store.isViewingStaged} />
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

  return (
    <ResizablePanelGroup className={cn("h-full")} ratios={ratios} onCommit={onCommit}>
      <ResizablePanelGroup.Pane minSize={160}>
        <div className={cn("flex flex-col h-full bg-sidebar overflow-hidden")}>
          <FileSection
            title="Files"
            files={files}
            selectedFile={store.selectedFile}
            onSelect={store.selectFile}
          />
        </div>
      </ResizablePanelGroup.Pane>
      <ResizablePanelGroup.Pane minSize={200}>
        <DiffViewer diff={store.currentDiff} selectedFile={store.selectedFile} isStaged={false} isCommitView />
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
