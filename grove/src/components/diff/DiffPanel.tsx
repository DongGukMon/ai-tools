import {
  FileCode2,
  GitCommitHorizontal,
  PanelRightOpen,
} from "lucide-react";
import { useProjectStore } from "../../store/project";
import { useDiff } from "../../hooks/useDiff";
import type { FileDiff } from "../../types";
import CommitList from "./CommitList";
import FileList from "./FileList";
import DiffViewer from "./DiffViewer";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { getFileStatusMeta, splitFilePath } from "./fileStatusMeta";

export default function DiffPanel() {
  const selectedWorktree = useProjectStore((store) => store.selectedWorktree);
  const diffStore = useDiff(selectedWorktree?.path ?? null);

  if (!selectedWorktree) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6",
        )}
      >
        <div
          className={cn(
            "max-w-sm rounded-2xl border border-dashed border-[var(--color-border)] bg-white px-6 py-8 text-center shadow-xs",
          )}
        >
          <div
            className={cn(
              "mx-auto flex size-12 items-center justify-center rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]",
            )}
          >
            <PanelRightOpen size={20} strokeWidth={2} />
          </div>
          <p className={cn("mt-4 text-[13px] font-semibold text-[var(--color-text)]")}>
            Diff panel is waiting for a worktree
          </p>
          <p
            className={cn(
              "mt-2 text-[12px] leading-relaxed text-[var(--color-text-tertiary)]",
            )}
          >
            Select a worktree on the left to review local changes, staged files,
            and commit diffs in this panel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-bg)]",
      )}
    >
      <CommitList
        commits={diffStore.commits}
        fileStatuses={diffStore.fileStatuses}
        selectedView={diffStore.selectedView}
        onSelectView={diffStore.selectView}
      />

      {diffStore.selectedView === "changes" ? (
        <FileList
          fileStatuses={diffStore.fileStatuses}
          selectedFile={diffStore.selectedFile}
          isViewingStaged={diffStore.isViewingStaged}
          onSelectFile={diffStore.selectFile}
          onStageFile={diffStore.stageFile}
          onUnstageFile={diffStore.unstageFile}
          onDiscardFile={diffStore.discardFile}
        />
      ) : (
        diffStore.commitDiffs.length > 0 && (
          <CommitFilesList
            diffs={diffStore.commitDiffs}
            selectedFile={diffStore.selectedFile}
            onSelectFile={diffStore.selectFile}
          />
        )
      )}

      <DiffViewer
        diff={diffStore.currentDiff}
        selectedFile={diffStore.selectedFile}
        isViewingStaged={diffStore.isViewingStaged}
        readOnly={diffStore.selectedView !== "changes"}
        selectedLines={diffStore.selectedLines}
        onToggleLine={diffStore.toggleLine}
        onClearSelection={diffStore.clearSelection}
        onStageHunk={diffStore.stageHunk}
        onUnstageHunk={diffStore.unstageHunk}
        onDiscardHunk={diffStore.discardHunk}
        onStageLines={diffStore.stageLines}
        onUnstageLines={diffStore.unstageLines}
        onDiscardLines={diffStore.discardLines}
      />
    </div>
  );
}

function CommitFilesList({
  diffs,
  selectedFile,
  onSelectFile,
}: {
  diffs: FileDiff[];
  selectedFile: string | null;
  onSelectFile: (path: string | null, staged?: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg)]",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-4 pb-2 pt-3 select-none",
        )}
      >
        <div className={cn("flex items-center gap-2")}>
          <div
            className={cn(
              "flex size-7 items-center justify-center rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]",
            )}
          >
            <GitCommitHorizontal size={14} strokeWidth={2} />
          </div>
          <div>
            <p
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]",
              )}
            >
              Selected Commit
            </p>
            <p
              className={cn(
                "mt-1 text-[13px] font-semibold text-[var(--color-text)]",
              )}
            >
              Files
            </p>
          </div>
        </div>
        <Badge
          variant="secondary"
          className={cn(
            "rounded-full border border-[var(--color-border-light)] bg-white px-2 py-0 text-[10px] font-semibold text-[var(--color-text-secondary)] shadow-xs",
          )}
        >
          {diffs.length}
        </Badge>
      </div>

      <div className={cn("max-h-[240px] overflow-y-auto px-3 pb-3")}>
        <div className={cn("space-y-1.5")}>
          {diffs.map((diff) => {
            const isSelected = selectedFile === diff.path;
            const { accentColor, badgeVariant, label, shortLabel } =
              getFileStatusMeta(diff.status);
            const { directory, fileName } = splitFilePath(diff.path);

            return (
              <Button
                key={diff.path}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-auto w-full justify-start rounded-xl border px-3 py-3 text-left shadow-xs transition-all",
                  {
                    "border-[var(--color-primary-border)] bg-white":
                      isSelected,
                    "border-transparent bg-transparent hover:border-[var(--color-border-light)] hover:bg-white/80":
                      !isSelected,
                  },
                )}
                onClick={() => onSelectFile(diff.path)}
                title={diff.path}
              >
                <div className={cn("flex w-full items-start gap-3")}>
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border-light)] bg-white text-[var(--color-text-secondary)]",
                    )}
                  >
                    <FileCode2 size={14} strokeWidth={2} />
                  </div>

                  <div className={cn("min-w-0 flex-1")}>
                    <div className={cn("flex items-center gap-2")}>
                      <span
                        className={cn("min-w-0 flex-1 truncate text-[12px]", {
                          "font-semibold": isSelected,
                          "font-medium": !isSelected,
                        })}
                      >
                        {fileName}
                      </span>
                      <Badge
                        variant={badgeVariant}
                        className={cn(
                          "rounded-full px-2 py-0 text-[10px] font-semibold",
                        )}
                        style={{ color: accentColor }}
                      >
                        {shortLabel}
                      </Badge>
                    </div>
                    <div
                      className={cn(
                        "mt-1 flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)]",
                      )}
                    >
                      <span className={cn("truncate")}>
                        {directory ? `${directory}/` : "Repository root"}
                      </span>
                      <span className={cn("text-[var(--color-text-muted)]")}>
                        •
                      </span>
                      <span>{label}</span>
                    </div>
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
