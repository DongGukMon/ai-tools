import { Plus, Minus, Trash2 } from "lucide-react";
import type { DiffHunk as DiffHunkType } from "../../types";
import DiffLine from "./DiffLine";

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
  return (
    <div className={!isFirst ? "border-t border-[var(--color-border)]" : ""}>
      {/* Hunk header */}
      <div className="flex items-center gap-2 px-3 h-[30px] bg-[#f6f8fa] border-b border-[var(--color-border)] select-none">
        <span className="flex-1 truncate font-mono text-[11px] text-[#656d76]">
          {hunk.header}
        </span>
        {!readOnly && (
          <span className="flex gap-1.5 shrink-0">
            {!isViewingStaged && (
              <>
                <ActionPill onClick={onStageHunk} variant="default">
                  <Plus size={11} strokeWidth={2.5} />
                  Stage
                </ActionPill>
                <ActionPill onClick={onDiscardHunk} variant="danger">
                  <Trash2 size={10} strokeWidth={2} />
                  Discard
                </ActionPill>
              </>
            )}
            {isViewingStaged && (
              <ActionPill onClick={onUnstageHunk} variant="default">
                <Minus size={11} strokeWidth={2.5} />
                Unstage
              </ActionPill>
            )}
          </span>
        )}
      </div>

      {/* Lines */}
      {hunk.lines.map((line) => (
        <DiffLine key={line.index} line={line} />
      ))}
    </div>
  );
}

function ActionPill({
  children,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: "default" | "danger";
}) {
  const base =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors duration-100 cursor-pointer";
  const styles =
    variant === "danger"
      ? "text-[#cf222e] border-[#cf222e]/20 bg-white hover:bg-[#ffebe9]"
      : "text-[#656d76] border-[#d0d7de] bg-white hover:bg-[#f3f4f6]";

  return (
    <button className={`${base} ${styles}`} onClick={onClick}>
      {children}
    </button>
  );
}
