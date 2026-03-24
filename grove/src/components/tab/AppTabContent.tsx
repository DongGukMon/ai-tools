import { FileText, Globe } from "lucide-react";
import { useTabStore } from "../../store/tab";
import { cn } from "../../lib/cn";
import TerminalPanel from "../terminal/TerminalPanel";
import type { AppTabType } from "../../types";

function Placeholder({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <div className={cn("flex flex-1 items-center justify-center gap-2 text-muted-foreground")}>
      <Icon className={cn("h-5 w-5")} />
      <span className={cn("text-sm")}>{label}</span>
    </div>
  );
}

const NON_TERMINAL_CONTENT: Record<Exclude<AppTabType, "terminal">, () => React.ReactNode> = {
  changes: () => <Placeholder icon={FileText} label="Changes (coming soon)" />,
  browser: () => <Placeholder icon={Globe} label="Browser (coming soon)" />,
};

function AppTabContent() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const isTerminal = activeTabId === "terminal";

  return (
    <div className={cn("flex flex-col flex-1 min-h-0")}>
      {/* Terminal is always mounted — toggle visibility */}
      <div className={cn("flex flex-col flex-1 min-h-0", { hidden: !isTerminal })}>
        <TerminalPanel />
      </div>

      {/* Non-terminal content */}
      {activeTab && activeTab.type !== "terminal" && (
        <div className={cn("flex flex-col flex-1 min-h-0")}>
          {NON_TERMINAL_CONTENT[activeTab.type as Exclude<AppTabType, "terminal">]()}
        </div>
      )}
    </div>
  );
}

export default AppTabContent;
