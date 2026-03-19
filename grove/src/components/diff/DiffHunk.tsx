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
  onToggleLine: (index: number) => void;
}

export default function DiffHunk({
  hunk,
  isFirst,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={cn({ "border-t border-border": !isFirst })}>
      {/* Hunk header */}
      <div className={cn("flex items-center gap-2 px-3 h-[30px] bg-secondary/50 border-b border-border select-none")}>
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
      </div>

      {/* Lines grouped by type */}
      {!collapsed &&
        groupLines(hunk.lines).map((group, gi) => (
          <LineGroupView key={gi} type={group.type} lines={group.lines} />
        ))}
    </div>
  );
}

function LineGroupView({
  type,
  lines,
}: {
  type: GroupType;
  lines: DiffLineType[];
}) {
  const isAdd = type === "add";
  const isRemove = type === "remove";
  const isContext = type === "context";

  const containerBg = isAdd
    ? "var(--diff-add-bg)"
    : isRemove
      ? "var(--diff-remove-bg)"
      : undefined;

  const gutterBg = isAdd
    ? "var(--diff-add-gutter-bg)"
    : isRemove
      ? "var(--diff-remove-gutter-bg)"
      : undefined;

  const prefixColor = isAdd
    ? "var(--color-success)"
    : isRemove
      ? "var(--color-danger)"
      : "transparent";

  const prefix = isAdd ? "+" : isRemove ? "-" : " ";

  const borderColor = isAdd
    ? "rgba(46, 160, 67, 0.3)"
    : isRemove
      ? "rgba(248, 81, 73, 0.3)"
      : "transparent";

  return (
    <div
      className="flex"
      style={{
        backgroundColor: containerBg,
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      {/* Fixed gutter */}
      <div className="shrink-0" style={{ backgroundColor: gutterBg }}>
        {lines.map((line) => (
          <div
            key={line.index}
            className={cn("flex min-h-[20px] leading-[20px] font-mono text-[12px]")}
          >
            <span className={cn("w-[40px] text-right pr-2 text-[11px] select-none", {
              "text-muted-foreground/50": isContext,
              "text-muted-foreground": !isContext,
            })}>
              {line.oldLineNumber ?? ""}
            </span>
            <span className={cn("w-[40px] text-right pr-2 text-[11px] select-none", {
              "text-muted-foreground/50": isContext,
              "text-muted-foreground": !isContext,
            })}>
              {line.newLineNumber ?? ""}
            </span>
            <span
              className={cn("w-[18px] text-center select-none font-medium")}
              style={{ color: prefixColor }}
            >
              {prefix}
            </span>
          </div>
        ))}
      </div>

      {/* Shared scrollable code content */}
      <div className={cn("flex-1 overflow-x-auto overflow-y-hidden diff-line-content")}>
        {lines.map((line) => (
          <div
            key={line.index}
            className={cn("min-h-[20px] leading-[20px] font-mono text-[12px] whitespace-pre pr-3", {
              "text-foreground/80": isContext,
            })}
          >
            {line.content}
          </div>
        ))}
      </div>
    </div>
  );
}
