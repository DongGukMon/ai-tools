import {
  FileCode2,
  GitCommitHorizontal,
  Sparkles,
} from "lucide-react";
import type { DiffHunk as DiffHunkType, FileDiff } from "../../types";
import DiffHunk from "./DiffHunk";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { getFileStatusMeta } from "./fileStatusMeta";

interface Props {
  diff: FileDiff | null;
  selectedFile: string | null;
  isViewingStaged: boolean;
  readOnly?: boolean;
  selectedLines: Set<number>;
  onToggleLine: (index: number) => void;
  onClearSelection: () => void;
  onStageHunk: (path: string, hunkIndex: number) => Promise<void>;
  onUnstageHunk: (path: string, hunkIndex: number) => Promise<void>;
  onDiscardHunk: (path: string, hunkIndex: number) => Promise<void>;
  onStageLines: (
    path: string,
    hunkIndex: number,
    lineIndices: number[],
  ) => Promise<void>;
  onUnstageLines: (
    path: string,
    hunkIndex: number,
    lineIndices: number[],
  ) => Promise<void>;
  onDiscardLines: (
    path: string,
    hunkIndex: number,
    lineIndices: number[],
  ) => Promise<void>;
}

function findSelectedHunk(
  hunks: DiffHunkType[],
  selectedLines: Set<number>,
): [number, number[]] | null {
  for (let i = 0; i < hunks.length; i++) {
    const matched = hunks[i].lines
      .filter((line) => selectedLines.has(line.index))
      .map((line) => line.index);
    if (matched.length > 0) {
      return [i, matched];
    }
  }

  return null;
}

export default function DiffViewer({
  diff,
  selectedFile,
  isViewingStaged,
  readOnly = false,
  selectedLines,
  onToggleLine,
  onClearSelection,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
  onStageLines,
  onUnstageLines,
  onDiscardLines,
}: Props) {
  if (!diff || !selectedFile) {
    return (
      <EmptyState
        icon={FileCode2}
        title="Select a file"
        description={
          readOnly
            ? "Pick a file from the selected commit to inspect its patch."
            : "Choose a staged or unstaged file to inspect its diff and use file, hunk, or line actions."
        }
      />
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No visible hunks"
        description={
          readOnly
            ? "This commit diff does not contain renderable hunks for the selected file."
            : "The selected view currently has no diff hunks to act on."
        }
      />
    );
  }

  const hasSelection = !readOnly && selectedLines.size > 0;
  const { accentColor, badgeVariant, label } = getFileStatusMeta(diff.status);

  const applyToSelectedLines = async (
    action: (path: string, hunkIndex: number, lineIndices: number[]) => Promise<void>,
  ) => {
    const result = findSelectedHunk(diff.hunks, selectedLines);
    if (result) {
      await action(selectedFile, result[0], result[1]);
      onClearSelection();
    }
  };

  return (
    <div className={cn("flex-1 overflow-y-auto bg-[var(--color-bg-secondary)]")}>
      <div
        className={cn(
          "sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 backdrop-blur",
        )}
      >
        <div className={cn("flex flex-wrap items-start gap-3")}>
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border-light)] bg-white text-[var(--color-text-secondary)] shadow-xs",
            )}
          >
            {readOnly ? (
              <GitCommitHorizontal size={16} strokeWidth={2} />
            ) : (
              <FileCode2 size={16} strokeWidth={2} />
            )}
          </div>

          <div className={cn("min-w-0 flex-1")}>
            <div className={cn("flex flex-wrap items-center gap-2")}>
              <span
                className={cn(
                  "truncate text-[13px] font-semibold text-[var(--color-text)]",
                )}
              >
                {selectedFile}
              </span>
              <Badge
                variant={badgeVariant}
                className={cn("rounded-full px-2 py-0 text-[10px] font-semibold")}
                style={{ color: accentColor }}
              >
                {label}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full border-[var(--color-border-light)] bg-white px-2 py-0 text-[10px] font-semibold text-[var(--color-text-secondary)]",
                )}
              >
                {readOnly
                  ? "Commit diff"
                  : isViewingStaged
                    ? "Staged diff"
                    : "Unstaged diff"}
              </Badge>
              <Badge
                variant="secondary"
                className={cn(
                  "rounded-full border border-[var(--color-border-light)] bg-white px-2 py-0 text-[10px] font-semibold text-[var(--color-text-secondary)]",
                )}
              >
                {diff.hunks.length} hunk{diff.hunks.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <p
              className={cn(
                "mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)]",
              )}
            >
              {hasSelection
                ? `${selectedLines.size} line${selectedLines.size === 1 ? "" : "s"} selected for a partial diff action.`
                : readOnly
                  ? "Inspect the selected commit diff. Actions are disabled in commit view."
                  : "Use file or hunk controls, or click changed lines to build a partial stage, unstage, or discard action."}
            </p>
          </div>

          {hasSelection && (
            <div className={cn("ml-auto flex shrink-0 items-center gap-1.5")}>
              {!isViewingStaged && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 rounded-lg border-[var(--color-border-light)] bg-white px-3 text-[11px] font-semibold hover:border-[var(--color-primary-border)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]",
                    )}
                    onClick={() => {
                      void applyToSelectedLines(onStageLines);
                    }}
                  >
                    Stage
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 rounded-lg border-[var(--color-danger)]/15 bg-white px-3 text-[11px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]",
                    )}
                    onClick={() => {
                      void applyToSelectedLines(onDiscardLines);
                    }}
                  >
                    Discard
                  </Button>
                </>
              )}

              {isViewingStaged && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 rounded-lg border-[var(--color-border-light)] bg-white px-3 text-[11px] font-semibold hover:bg-[var(--color-bg-secondary)]",
                  )}
                  onClick={() => {
                    void applyToSelectedLines(onUnstageLines);
                  }}
                >
                  Unstage
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 rounded-lg px-3 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-white",
                )}
                onClick={onClearSelection}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className={cn("space-y-3 p-4")}>
        {diff.hunks.map((hunk, index) => (
          <DiffHunk
            key={`${hunk.header}-${index}`}
            hunk={hunk}
            hunkIndex={index}
            isViewingStaged={isViewingStaged}
            readOnly={readOnly}
            selectedLines={selectedLines}
            onToggleLine={onToggleLine}
            onClearSelection={onClearSelection}
            onStageHunk={() => onStageHunk(selectedFile, index)}
            onUnstageHunk={() => onUnstageHunk(selectedFile, index)}
            onDiscardHunk={() => onDiscardHunk(selectedFile, index)}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileCode2;
  title: string;
  description: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-center bg-[var(--color-bg-secondary)] p-6",
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
          <Icon size={20} strokeWidth={2} />
        </div>
        <p className={cn("mt-4 text-[13px] font-semibold text-[var(--color-text)]")}>
          {title}
        </p>
        <p
          className={cn(
            "mt-2 text-[12px] leading-relaxed text-[var(--color-text-tertiary)]",
          )}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
