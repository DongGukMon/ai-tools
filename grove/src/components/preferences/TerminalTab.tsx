import { usePreferencesStore } from "../../store/preferences";
import { cn } from "../../lib/cn";
import type { TerminalLinkOpenMode } from "../../types";
import TerminalAppearance from "./TerminalAppearance";

const LINK_OPEN_OPTIONS: {
  value: TerminalLinkOpenMode;
  label: string;
  description: string;
}[] = [
  {
    value: "external",
    label: "External Browser",
    description: "모든 링크를 외부 브라우저에서 열기",
  },
  {
    value: "internal",
    label: "Grove Browser",
    description: "모든 링크를 Grove 내장 브라우저에서 열기",
  },
  {
    value: "external-with-localhost-internal",
    label: "Localhost in Grove, others External",
    description: "localhost 링크만 내장 브라우저, 나머지는 외부 브라우저",
  },
];

export default function TerminalTab() {
  const terminalLinkOpenMode = usePreferencesStore((s) => s.terminalLinkOpenMode);
  const setTerminalLinkOpenMode = usePreferencesStore((s) => s.setTerminalLinkOpenMode);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTerminalLinkOpenMode(e.target.value as TerminalLinkOpenMode);
  };

  return (
    <div>
      <h3 className={cn("text-sm font-semibold text-foreground mb-6")}>Terminal</h3>

      {/* Link Open Mode */}
      <div className={cn("mb-6")}>
        <label className={cn("block text-[12px] text-muted-foreground mb-1.5")}>
          Link Open Mode
        </label>
        <p className={cn("text-[11px] text-muted-foreground/70 mb-2")}>
          터미널에서 링크를 클릭할 때 열리는 위치
        </p>
        <select
          value={terminalLinkOpenMode}
          onChange={handleChange}
          className={cn(
            "w-[320px] rounded-md border border-border bg-background px-3 py-1.5 text-[12px] text-foreground",
            "focus:outline-none focus:border-ring transition-colors",
          )}
        >
          {LINK_OPEN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} — {opt.description}
            </option>
          ))}
        </select>
      </div>

      {/* Divider */}
      <div className={cn("border-t border-border mb-6")} />

      {/* Appearance */}
      <TerminalAppearance />
    </div>
  );
}
