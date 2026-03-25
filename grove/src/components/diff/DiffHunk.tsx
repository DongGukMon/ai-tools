import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { DiffHunk as DiffHunkType, DiffLine as DiffLineType } from "../../types";
import { cn } from "../../lib/cn";

type GroupType = "add" | "remove" | "context";
type LineGroup = { type: GroupType; lines: DiffLineType[] };

function groupLines(lines: DiffLineType[]): LineGroup[] {
  const groups: LineGroup[] = [];
  for (const line of lines) {
    const type: GroupType = line.type === "add" ? "add" : line.type === "remove" ? "remove" : "context";
    const last = groups[groups.length - 1];
    if (last && last.type === type) {
      last.lines.push(line);
    } else {
      groups.push({ type, lines: [line] });
    }
  }
  return groups;
}

interface Props {
  hunk: DiffHunkType;
  hunkIndex: number;
  filePath: string;
  isFirst: boolean;
  selectedLines: Set<number>;
  isStaged: boolean;
  onStageHunk?: (filePath: string, hunkIndex: number) => void;
  onUnstageHunk?: (filePath: string, hunkIndex: number) => void;
  onDiscardHunk?: (filePath: string, hunkIndex: number) => void;
  onStageLines?: (filePath: string, hunkIndex: number, lineIndices: number[]) => void;
  onUnstageLines?: (filePath: string, hunkIndex: number, lineIndices: number[]) => void;
  onGutterClick: (lineIndex: number, shiftKey: boolean) => void;
  onGutterMouseDown: (lineIndex: number) => void;
  onGutterMouseEnter: (lineIndex: number, buttons: number) => void;
  onGutterMouseUp: () => void;
}

export default function DiffHunk({
  hunk,
  hunkIndex,
  filePath,
  isFirst,
  selectedLines,
  isStaged,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
  onStageLines,
  onUnstageLines,
  onGutterClick,
  onGutterMouseDown,
  onGutterMouseEnter,
  onGutterMouseUp,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // Get selected lines that belong to this hunk
  const hunkLineIndices = hunk.lines.map((l) => l.index);
  const selectedInHunk = hunkLineIndices.filter((idx) => selectedLines.has(idx));

  const handleStage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedInHunk.length > 0 && onStageLines) {
      onStageLines(filePath, hunkIndex, selectedInHunk);
    } else {
      onStageHunk?.(filePath, hunkIndex);
    }
  };

  const handleUnstage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedInHunk.length > 0 && onUnstageLines) {
      onUnstageLines(filePath, hunkIndex, selectedInHunk);
    } else {
      onUnstageHunk?.(filePath, hunkIndex);
    }
  };

  return (
    <div className={cn({ "border-t border-border": !isFirst })}>
      {/* Hunk header */}
      <div
        className={cn("flex items-center gap-2 px-3 h-[30px] select-none")}
        style={{ background: "rgba(99, 163, 255, 0.04)", borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}
      >
        <button
          className={cn("flex items-center justify-center w-[18px] h-[18px] shrink-0 rounded hover:bg-secondary transition-colors cursor-pointer text-muted-foreground")}
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expand hunk" : "Collapse hunk"}
        >
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={2} />
          ) : (
            <ChevronDown size={14} strokeWidth={2} />
          )}
        </button>
        <span className={cn("min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground")}>
          {hunk.header}
        </span>
        {(onStageHunk || onUnstageHunk || onDiscardHunk) && (
          <div className={cn("flex items-center gap-1 shrink-0")}>
            {isStaged ? (
              <button
                type="button"
                className={cn("px-2 py-0.5 text-[10px] rounded cursor-pointer border border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors")}
                onClick={handleUnstage}
              >
                {selectedInHunk.length > 0 ? `Unstage ${selectedInHunk.length} lines` : "Unstage"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={cn("px-2 py-0.5 text-[10px] rounded cursor-pointer border border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors")}
                  onClick={handleStage}
                >
                  {selectedInHunk.length > 0 ? `Stage ${selectedInHunk.length} lines` : "Stage"}
                </button>
                <button
                  type="button"
                  className={cn("px-2 py-0.5 text-[10px] rounded cursor-pointer border border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors")}
                  onClick={(e) => { e.stopPropagation(); onDiscardHunk?.(filePath, hunkIndex); }}
                >
                  Discard
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Lines grouped by type */}
      {!collapsed &&
        groupLines(hunk.lines).map((group, gi) => (
          <LineGroupView
            key={gi}
            type={group.type}
            lines={group.lines}
            selectedLines={selectedLines}
            onGutterClick={onGutterClick}
            onGutterMouseDown={onGutterMouseDown}
            onGutterMouseEnter={onGutterMouseEnter}
            onGutterMouseUp={onGutterMouseUp}
          />
        ))}
    </div>
  );
}

function LineGroupView({
  type,
  lines,
  selectedLines,
  onGutterClick,
  onGutterMouseDown,
  onGutterMouseEnter,
  onGutterMouseUp,
}: {
  type: GroupType;
  lines: DiffLineType[];
  selectedLines: Set<number>;
  onGutterClick: (lineIndex: number, shiftKey: boolean) => void;
  onGutterMouseDown: (lineIndex: number) => void;
  onGutterMouseEnter: (lineIndex: number, buttons: number) => void;
  onGutterMouseUp: () => void;
}) {
  const isAdd = type === "add";
  const isRemove = type === "remove";
  const isContext = type === "context";

  const containerBg = isAdd
    ? "rgba(63, 185, 80, 0.07)"
    : isRemove
      ? "rgba(248, 81, 73, 0.07)"
      : undefined;

  const gutterBg = isAdd
    ? "rgba(63, 185, 80, 0.04)"
    : isRemove
      ? "rgba(248, 81, 73, 0.04)"
      : undefined;

  const prefixColor = isAdd
    ? "rgba(63, 185, 80, 0.7)"
    : isRemove
      ? "rgba(248, 81, 73, 0.7)"
      : "transparent";

  const prefix = isAdd ? "+" : isRemove ? "-" : " ";

  const borderColor = isAdd
    ? "rgba(63, 185, 80, 0.3)"
    : isRemove
      ? "rgba(248, 81, 73, 0.3)"
      : "transparent";

  return (
    <div
      className="flex"
      style={{
        backgroundColor: containerBg,
        borderLeft: `2px solid ${borderColor}`,
      }}
    >
      {/* Fixed gutter */}
      <div className="shrink-0" style={{ backgroundColor: gutterBg }}>
        {lines.map((line) => {
          const isSelectable = !isContext;
          const isSelected = isSelectable && selectedLines.has(line.index);

          return (
            <div
              key={line.index}
              data-gutter-line={isSelectable ? "" : undefined}
              className={cn("flex min-h-[20px] leading-[20px] font-mono text-[12px]", {
                "cursor-pointer": isSelectable,
              })}
              style={isSelected ? { boxShadow: `inset 3px 0 0 ${borderColor.replace("0.3", "0.8")}` } : undefined}
              onClick={isSelectable ? (e) => { e.stopPropagation(); onGutterClick(line.index, e.shiftKey); } : undefined}
              onMouseDown={isSelectable ? () => onGutterMouseDown(line.index) : undefined}
              onMouseEnter={isSelectable ? (e) => onGutterMouseEnter(line.index, e.buttons) : undefined}
              onMouseUp={isSelectable ? onGutterMouseUp : undefined}
            >
              <span
                className={cn("w-[32px] text-right pr-1.5 text-[11px] select-none")}
                style={{ color: "rgba(255, 255, 255, 0.15)" }}
              >
                {line.oldLineNumber ?? ""}
              </span>
              <span
                className={cn("w-[32px] text-right pr-1.5 text-[11px] select-none")}
                style={{ color: "rgba(255, 255, 255, 0.15)" }}
              >
                {line.newLineNumber ?? ""}
              </span>
              <span
                className={cn("w-[18px] text-center select-none font-medium")}
                style={{ color: prefixColor }}
              >
                {prefix}
              </span>
            </div>
          );
        })}
      </div>

      {/* Shared scrollable code content */}
      <div className={cn("flex-1 overflow-x-auto overflow-y-hidden diff-line-content")}>
        {lines.map((line) => {
          const isSelectable = !isContext;
          const isSelected = isSelectable && selectedLines.has(line.index);

          return (
            <div
              key={line.index}
              className={cn("min-h-[20px] leading-[20px] font-mono text-[12px] whitespace-pre pr-3", {
                "text-foreground/80": isContext,
              })}
              style={isSelected ? { backgroundColor: isAdd ? "rgba(46, 160, 67, 0.15)" : "rgba(248, 81, 73, 0.15)" } : undefined}
            >
              {line.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
