import { useState } from "react";
import type { DiffLine as DiffLineType } from "../../types";

interface Props {
  line: DiffLineType;
  isSelected: boolean;
  onToggle: () => void;
  showCheckbox: boolean;
}

export default function DiffLine({
  line,
  isSelected,
  onToggle,
  showCheckbox,
}: Props) {
  const [hovered, setHovered] = useState(false);

  const bgColor =
    line.type === "add"
      ? isSelected
        ? "rgba(152, 195, 121, 0.3)"
        : "rgba(152, 195, 121, 0.15)"
      : line.type === "remove"
        ? isSelected
          ? "rgba(224, 108, 117, 0.3)"
          : "rgba(224, 108, 117, 0.15)"
        : "transparent";

  const hoverBg =
    line.type === "add"
      ? "rgba(152, 195, 121, 0.25)"
      : line.type === "remove"
        ? "rgba(224, 108, 117, 0.25)"
        : "rgba(255, 255, 255, 0.03)";

  return (
    <div
      style={{
        ...styles.line,
        background: hovered && !isSelected ? hoverBg : bgColor,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Line selection checkbox */}
      <span style={styles.checkbox}>
        {showCheckbox && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            style={styles.checkboxInput}
          />
        )}
      </span>

      {/* Line numbers */}
      <span style={styles.lineNum}>
        {line.oldLineNumber ?? ""}
      </span>
      <span style={styles.lineNum}>
        {line.newLineNumber ?? ""}
      </span>

      {/* Prefix (+/-/space) */}
      <span style={styles.prefix}>
        {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
      </span>

      {/* Content */}
      <span style={styles.content}>{line.content}</span>
    </div>
  );
}

const styles = {
  line: {
    display: "flex",
    alignItems: "stretch",
    minHeight: 20,
    lineHeight: "20px",
    whiteSpace: "pre" as const,
    fontSize: 12,
    fontFamily: "monospace",
  },
  checkbox: {
    width: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxInput: {
    margin: 0,
    cursor: "pointer",
    accentColor: "var(--accent)",
  },
  lineNum: {
    width: 45,
    textAlign: "right" as const,
    paddingRight: 8,
    color: "var(--text-secondary)",
    fontSize: 11,
    flexShrink: 0,
    userSelect: "none" as const,
    opacity: 0.6,
  },
  prefix: {
    width: 14,
    textAlign: "center" as const,
    flexShrink: 0,
    fontWeight: 700,
  },
  content: {
    flex: 1,
    paddingRight: 12,
    overflowX: "auto" as const,
  },
};
