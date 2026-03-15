import type { DiffLine as DiffLineType } from "../../types";
import { cn } from "../../lib/cn";

interface Props {
  line: DiffLineType;
  readOnly?: boolean;
  isSelected?: boolean;
  onToggleLine?: (index: number) => void;
}

export default function DiffLine({
  line,
  readOnly = false,
  isSelected = false,
  onToggleLine,
}: Props) {
  const isAdd = line.type === "add";
  const isRemove = line.type === "remove";
  const canSelect = !readOnly && (isAdd || isRemove) && !!onToggleLine;

  const rowBg = isAdd
    ? "bg-[var(--diff-add-bg)]"
    : isRemove
      ? "bg-[var(--diff-remove-bg)]"
      : "";

  const gutterBg = isAdd
    ? "bg-[var(--diff-add-gutter-bg)]"
    : isRemove
      ? "bg-[var(--diff-remove-gutter-bg)]"
      : "";

  const prefixColor = isAdd
    ? "text-[var(--color-success)]"
    : isRemove
      ? "text-[var(--color-danger)]"
      : "text-transparent";

  return (
    <div
      className={cn(
        "group flex min-h-[22px] items-stretch font-mono text-[12px] leading-[22px] transition-colors",
        rowBg,
        {
          "cursor-pointer": canSelect,
          "border-l-[3px] border-l-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary-border)]":
            isSelected,
        },
      )}
      onClick={() => {
        if (canSelect) {
          onToggleLine(line.index);
        }
      }}
    >
      <span
        className={cn(
          "flex w-6 shrink-0 items-center justify-center border-r border-white/50",
          gutterBg,
        )}
      >
        <span
          className={cn(
            "size-2 rounded-full border transition-opacity",
            {
              "border-[var(--color-primary)] bg-[var(--color-primary)] opacity-100":
                isSelected && canSelect,
              "border-[var(--color-border)] bg-white opacity-0 group-hover:opacity-100":
                !isSelected && canSelect,
              "opacity-0": !canSelect,
            },
          )}
        />
      </span>

      <span
        className={cn(
          "w-[40px] shrink-0 select-none text-right text-[11px] text-[var(--color-text-tertiary)]",
          gutterBg,
          "pr-2",
        )}
      >
        {line.oldLineNumber ?? ""}
      </span>

      <span
        className={cn(
          "w-[40px] shrink-0 select-none text-right text-[11px] text-[var(--color-text-tertiary)]",
          gutterBg,
          "pr-2",
        )}
      >
        {line.newLineNumber ?? ""}
      </span>

      <span
        className={cn(
          "w-[18px] shrink-0 select-none text-center font-medium",
          prefixColor,
          gutterBg,
        )}
      >
        {isAdd ? "+" : isRemove ? "-" : " "}
      </span>

      <span
        className={cn(
          "diff-line-content flex-1 overflow-x-auto whitespace-pre pr-4",
          {
            "font-medium": isSelected,
          },
        )}
      >
        {line.content}
      </span>
    </div>
  );
}
