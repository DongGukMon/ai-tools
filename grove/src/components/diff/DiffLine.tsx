import type { DiffLine as DiffLineType } from "../../types";

interface Props {
  line: DiffLineType;
}

export default function DiffLine({ line }: Props) {
  const isAdd = line.type === "add";
  const isRemove = line.type === "remove";

  // GitHub-style row backgrounds
  const rowBg = isAdd
    ? "bg-[var(--diff-add-bg)]"
    : isRemove
      ? "bg-[var(--diff-remove-bg)]"
      : "";

  // Gutter backgrounds (slightly more saturated than row)
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
      className={`flex items-stretch min-h-[20px] leading-[20px] font-mono text-[12px] ${rowBg}`}
    >
      {/* Old line number gutter */}
      <span
        className={`w-[40px] text-right pr-2 text-[11px] text-[var(--color-text-tertiary)] shrink-0 select-none ${gutterBg}`}
      >
        {line.oldLineNumber ?? ""}
      </span>

      {/* New line number gutter */}
      <span
        className={`w-[40px] text-right pr-2 text-[11px] text-[var(--color-text-tertiary)] shrink-0 select-none ${gutterBg}`}
      >
        {line.newLineNumber ?? ""}
      </span>

      {/* Prefix (+/-/space) */}
      <span
        className={`w-[18px] text-center shrink-0 select-none font-medium ${prefixColor} ${gutterBg}`}
      >
        {isAdd ? "+" : isRemove ? "-" : " "}
      </span>

      {/* Content */}
      <span className="diff-line-content flex-1 pr-3 whitespace-pre overflow-x-auto">
        {line.content}
      </span>
    </div>
  );
}
