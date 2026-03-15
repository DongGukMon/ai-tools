import { useState } from "react";
import { Columns2, Rows2, Settings, X } from "lucide-react";
import { useTerminal } from "../../hooks/useTerminal";
import ThemeSettings from "./ThemeSettings";

export default function TerminalToolbar() {
  const { splitCurrent, closeCurrent, focusedPtyId } = useTerminal();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-end px-2 h-[28px] shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <div className="flex items-center gap-0.5">
          <button
            className="flex items-center justify-center w-[24px] h-[24px] rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors duration-100"
            onClick={() => setSettingsOpen((v) => !v)}
            title="Terminal Theme Settings"
          >
            <Settings size={14} strokeWidth={1.5} />
          </button>
          <button
            className="flex items-center justify-center w-[24px] h-[24px] rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-20 disabled:cursor-not-allowed transition-colors duration-100"
            onClick={() => splitCurrent("horizontal")}
            disabled={!focusedPtyId}
            title="Split Horizontal"
          >
            <Columns2 size={14} strokeWidth={1.5} />
          </button>
          <button
            className="flex items-center justify-center w-[24px] h-[24px] rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-20 disabled:cursor-not-allowed transition-colors duration-100"
            onClick={() => splitCurrent("vertical")}
            disabled={!focusedPtyId}
            title="Split Vertical"
          >
            <Rows2 size={14} strokeWidth={1.5} />
          </button>
          <button
            className="flex items-center justify-center w-[24px] h-[24px] rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] disabled:opacity-20 disabled:cursor-not-allowed transition-colors duration-100"
            onClick={closeCurrent}
            disabled={!focusedPtyId}
            title="Close Terminal"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <ThemeSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
