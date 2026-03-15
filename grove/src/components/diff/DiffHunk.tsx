import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import type { DiffHunk as DiffHunkType } from "../../types";
import DiffLine from "./DiffLine";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../../lib/cn";

interface Props {
  hunk: DiffHunkType;
  hunkIndex: number;
  isViewingStaged: boolean;
  readOnly?: boolean;
  selectedLines: Set<number>;
  onToggleLine: (index: number) => void;
  onClearSelection: () => void;
  onStageHunk: () => void;
  onUnstageHunk: () => void;
  onDiscardHunk: () => void;
}

export default function DiffHunk({
  hunk,
  hunkIndex,
  isViewingStaged,
  readOnly = false,
  selectedLines,
  onToggleLine,
  onClearSelection,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const addedCount = hunk.lines.filter((line) => line.type === "add").length;
  const removedCount = hunk.lines.filter((line) => line.type === "remove").length;
  const lineIndexSet = new Set(hunk.lines.map((line) => line.index));
  const hasSelectionOutsideHunk = Array.from(selectedLines).some(
    (index) => !lineIndexSet.has(index),
  );

  const handleToggleLine = (index: number) => {
    if (hasSelectionOutsideHunk && !selectedLines.has(index)) {
      onClearSelection();
    }
    onToggleLine(index);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-xs",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2.5 select-none",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(
            "size-7 shrink-0 rounded-lg text-[var(--color-text-secondary)] hover:bg-white hover:text-[var(--color-text)]",
          )}
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expand hunk" : "Collapse hunk"}
        >
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={2.25} />
          ) : (
            <ChevronDown size={14} strokeWidth={2.25} />
          )}
        </Button>

        <div className={cn("min-w-0 flex-1")}>
          <div className={cn("flex flex-wrap items-center gap-1.5")}>
            <Badge
              variant="outline"
              className={cn(
                "rounded-full border-[var(--color-border-light)] bg-white px-2 py-0 font-mono text-[10px] font-semibold text-[var(--color-text-secondary)] shadow-none",
              )}
            >
              Hunk {hunkIndex + 1}
            </Badge>
            {addedCount > 0 && (
              <Badge
                variant="success"
                className={cn("rounded-full px-2 py-0 text-[10px] font-semibold")}
              >
                +{addedCount}
              </Badge>
            )}
            {removedCount > 0 && (
              <Badge
                variant="danger"
                className={cn("rounded-full px-2 py-0 text-[10px] font-semibold")}
              >
                -{removedCount}
              </Badge>
            )}
          </div>
          <p
            className={cn(
              "mt-1 truncate font-mono text-[11px] leading-relaxed text-[var(--color-text-secondary)]",
            )}
          >
            {hunk.header}
          </p>
        </div>

        {!readOnly && (
          <div className={cn("flex shrink-0 items-center gap-1.5")}>
            {!isViewingStaged && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 gap-1.5 rounded-lg border-[var(--color-border-light)] bg-white px-2.5 text-[11px] font-semibold text-[var(--color-text)] hover:border-[var(--color-primary-border)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]",
                  )}
                  onClick={() => {
                    void onStageHunk();
                  }}
                >
                  <Plus size={12} strokeWidth={2.25} />
                  Stage
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 gap-1.5 rounded-lg border-[var(--color-danger)]/15 bg-white px-2.5 text-[11px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]",
                  )}
                  onClick={() => {
                    void onDiscardHunk();
                  }}
                >
                  <Trash2 size={11} strokeWidth={2} />
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
                  "h-7 gap-1.5 rounded-lg border-[var(--color-border-light)] bg-white px-2.5 text-[11px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)]",
                )}
                onClick={() => {
                  void onUnstageHunk();
                }}
              >
                <Minus size={12} strokeWidth={2.25} />
                Unstage
              </Button>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <div className={cn("overflow-hidden")}>
          {hunk.lines.map((line) => (
            <DiffLine
              key={line.index}
              line={line}
              readOnly={readOnly}
              isSelected={selectedLines.has(line.index)}
              onToggleLine={handleToggleLine}
            />
          ))}
        </div>
      )}
    </div>
  );
}
