import { useState } from "react";
import { Columns2, Play, Rows2, ScreenShare, Settings, X } from "lucide-react";
import { useTerminalCommandPipeline } from "../../hooks/useTerminalCommandPipeline";
import type { TerminalCommandDefinition } from "../../lib/terminal-command-pipeline";
import ThemeSettings from "./ThemeSettings";
import { IconButton } from "../ui/button";
import { cn } from "../../lib/cn";


const terminalCommandIcons = {
  settings: Settings,
  mirror: ScreenShare,
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
      <div className={cn("flex items-center justify-end border-b border-border bg-sidebar px-2 h-9 shrink-0")}>
        <div className={cn("flex items-center gap-1")}>
          {commands.map((command) => {
            const Icon = terminalCommandIcons[command.icon];
            return (
              <IconButton
                key={command.id}
                className={cn("h-7 w-7")}
                onClick={() => {
                  executeCommand(command).catch(() => {});
                }}
                disabled={!isCommandEnabled(command)}
                title={command.title}
              >
                <Icon className={cn("h-3.5 w-3.5")} />
              </IconButton>
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
