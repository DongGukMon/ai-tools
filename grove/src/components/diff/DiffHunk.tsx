import { useState } from "react";
import { Plus, Minus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import type { DiffHunk as DiffHunkType, DiffLine as DiffLineType } from "../../types";
import DiffLine from "./DiffLine";
import { Button } from "../ui/button";

function groupLines(lines: DiffLineType[]) {
  const groups: { type: "change" | "context"; lines: DiffLineType[] }[] = [];
  for (const line of lines) {
    const isChange = line.type === "add" || line.type === "remove";
    const groupType = isChange ? "change" : "context";
    const last = groups[groups.length - 1];
    if (last && last.type === groupType) {
      last.lines.push(line);
    } else {
      groups.push({ type: groupType, lines: [line] });
    }
  }
  return groups;
}

interface Props {
  hunk: DiffHunkType;
  hunkIndex: number;
  filePath: string;
  isViewingStaged: boolean;
  isFirst: boolean;
  readOnly?: boolean;
  selectedLines: Set<number>;
  onToggleLine: (index: number) => void;
  onStageHunk: () => void;
  onUnstageHunk: () => void;
  onDiscardHunk: () => void;
}

export default function DiffHunk({
  hunk,
  isViewingStaged,
  isFirst,
  readOnly = false,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={!isFirst ? "border-t border-[var(--color-border)]" : ""}>
      {/* Hunk header */}
      <div className="flex items-center gap-2 px-3 h-[30px] bg-[#f6f8fa] border-b border-[var(--color-border)] select-none">
        <button
          className="flex items-center justify-center w-[18px] h-[18px] shrink-0 rounded hover:bg-[#e1e4e8] transition-colors duration-100 cursor-pointer text-[#656d76]"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expand hunk" : "Collapse hunk"}
        >
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={2} />
          ) : (
            <ChevronDown size={14} strokeWidth={2} />
          )}
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#656d76]">
          {hunk.header}
        </span>
        {!readOnly && (
          <span className="flex gap-1.5 shrink-0">
            {!isViewingStaged && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto px-2 py-0.5 text-[10px] font-semibold text-[#656d76] border-[#d0d7de] bg-white hover:bg-[#f3f4f6] gap-1"
                  onClick={onStageHunk}
                >
                  <Plus size={11} strokeWidth={2.5} />
                  Stage
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto px-2 py-0.5 text-[10px] font-semibold text-[#cf222e] border-[#cf222e]/20 bg-white hover:bg-[#ffebe9] gap-1"
                  onClick={onDiscardHunk}
                >
                  <Trash2 size={10} strokeWidth={2} />
                  Discard
                </Button>
              </>
            )}
            {isViewingStaged && (
              <Button
                variant="outline"
                size="sm"
                className="h-auto px-2 py-0.5 text-[10px] font-semibold text-[#656d76] border-[#d0d7de] bg-white hover:bg-[#f3f4f6] gap-1"
                onClick={onUnstageHunk}
              >
                <Minus size={11} strokeWidth={2.5} />
                Unstage
              </Button>
            )}
          </span>
        )}
      </div>

      {/* Lines */}
      {!collapsed &&
        groupLines(hunk.lines).map((group, gi) => (
          <div
            key={gi}
            className={
              group.type === "change"
                ? "border-l-2 border-l-blue-300/50"
                : ""
            }
          >
            {group.lines.map((line) => (
              <DiffLine key={line.index} line={line} />
            ))}
          </div>
        ))}
    </div>
  );
}
