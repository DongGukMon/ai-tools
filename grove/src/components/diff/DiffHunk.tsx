import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { DiffHunk as DiffHunkType, DiffLine as DiffLineType } from "../../types";
import DiffLine from "./DiffLine";
import { cn } from "../../lib/cn";

type LineGroup = { type: "add" | "remove" | "context"; lines: DiffLineType[] };

function groupLines(lines: DiffLineType[]): LineGroup[] {
  const groups: LineGroup[] = [];
  for (const line of lines) {
    const type = line.type === "add" ? "add" : line.type === "remove" ? "remove" : "context";
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
    <div className={cn({ "border-t border-[var(--color-border)]": !isFirst })}>
      {/* Hunk header */}
      <div className={cn("flex items-center gap-2 px-3 h-[30px] bg-[#f6f8fa] border-b border-[var(--color-border)] select-none")}>
        <button
          className={cn("flex items-center justify-center w-[18px] h-[18px] shrink-0 rounded hover:bg-[#e1e4e8] transition-colors duration-100 cursor-pointer text-[#656d76]")}
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expand hunk" : "Collapse hunk"}
        >
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={2} />
          ) : (
            <ChevronDown size={14} strokeWidth={2} />
          )}
        </button>
        <span className={cn("min-w-0 flex-1 truncate font-mono text-[11px] text-[#656d76]")}>
          {hunk.header}
        </span>
      </div>

      {/* Lines grouped by type: remove / add / context */}
      {!collapsed &&
        groupLines(hunk.lines).map((group, gi) =>
          group.type === "context" ? (
            <div key={gi}>
              {group.lines.map((line) => (
                <DiffLine key={line.index} line={line} />
              ))}
            </div>
          ) : (
            <ChangeGroup key={gi} type={group.type} lines={group.lines} />
          ),
        )}
    </div>
  );
}

/**
 * A group of consecutive same-type change lines (all adds OR all removes).
 * Fixed gutter + shared horizontal scroll for code content.
 * Background color applied to the entire group container.
 */
function ChangeGroup({
  type,
  lines,
}: {
  type: "add" | "remove";
  lines: DiffLineType[];
}) {
  const isAdd = type === "add";
  const containerBg = isAdd ? "var(--diff-add-bg)" : "var(--diff-remove-bg)";
  const gutterBg = isAdd ? "var(--diff-add-gutter-bg)" : "var(--diff-remove-gutter-bg)";
  const prefixColor = isAdd ? "var(--color-success)" : "var(--color-danger)";
  const prefix = isAdd ? "+" : "-";
  const borderColor = isAdd
    ? "rgba(46, 160, 67, 0.3)"
    : "rgba(248, 81, 73, 0.3)";

  return (
    <div
      className="flex"
      style={{ backgroundColor: containerBg, borderLeft: `3px solid ${borderColor}` }}
    >
      {/* Fixed gutter */}
      <div className="shrink-0" style={{ backgroundColor: gutterBg }}>
        {lines.map((line) => (
          <div
            key={line.index}
            className={cn("flex min-h-[20px] leading-[20px] font-mono text-[12px]")}
          >
            <span className={cn("w-[40px] text-right pr-2 text-[11px] text-[var(--color-text-tertiary)] select-none")}>
              {line.oldLineNumber ?? ""}
            </span>
            <span className={cn("w-[40px] text-right pr-2 text-[11px] text-[var(--color-text-tertiary)] select-none")}>
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
            className={cn("min-h-[20px] leading-[20px] font-mono text-[12px] whitespace-pre pr-3")}
          >
            {line.content}
          </div>
        ))}
      </div>
    </div>
  );
}
