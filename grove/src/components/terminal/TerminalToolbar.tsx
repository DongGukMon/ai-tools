import { useState } from "react";
import { Columns2, Play, Rows2, Settings, X } from "lucide-react";
import { useTerminalCommandPipeline } from "../../hooks/useTerminalCommandPipeline";
import type { TerminalCommandDefinition } from "../../lib/terminal-command-pipeline";
import ThemeSettings from "./ThemeSettings";
import { Button } from "../ui/button";

const terminalCommandIcons = {
  settings: Settings,
  "split-horizontal": Columns2,
  "split-vertical": Rows2,
  close: X,
  play: Play,
} satisfies Record<TerminalCommandDefinition["icon"], typeof Settings>;

export default function TerminalToolbar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { commands, executeCommand, isCommandEnabled } =
    useTerminalCommandPipeline({
      openThemeSettings: () => setSettingsOpen((open) => !open),
    });

  return (
    <>
      <div className="flex items-center justify-end px-2 h-[28px] shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <div className="flex items-center gap-0.5">
          {commands.map((command) => {
            const Icon = terminalCommandIcons[command.icon];
            const destructive = command.id === "terminal-close";

            return (
              <Button
                key={command.id}
                variant="ghost"
                size="icon"
                className={
                  destructive
                    ? "w-[24px] h-[24px] rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] disabled:opacity-20 disabled:cursor-not-allowed"
                    : "w-[24px] h-[24px] rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-20 disabled:cursor-not-allowed"
                }
                onClick={() => {
                  executeCommand(command).catch(() => {});
                }}
                disabled={!isCommandEnabled(command)}
                title={command.title}
              >
                <Icon size={14} strokeWidth={1.5} />
              </Button>
            );
          })}
        </div>
      </div>
      <ThemeSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
