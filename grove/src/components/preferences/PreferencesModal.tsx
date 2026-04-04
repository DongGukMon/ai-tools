import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { cn } from "../../lib/cn";
import GeneralTab from "./GeneralTab";
import TerminalTab from "./TerminalTab";
import DeveloperTab from "./DeveloperTab";

type TabId = "general" | "terminal" | "developer";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "terminal", label: "Terminal" },
  { id: "developer", label: "Developer" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PreferencesModal({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className={cn(
          "gap-0 p-0 sm:max-w-4xl overflow-hidden",
        )}
        showCloseButton
      >
        <DialogTitle className={cn("sr-only")}>Preferences</DialogTitle>
        <DialogDescription className={cn("sr-only")}>
          Application preferences
        </DialogDescription>
        <div className={cn("flex h-[720px]")}>
          {/* Left: Tab Navigation */}
          <nav className={cn("flex w-[160px] shrink-0 flex-col gap-0.5 border-r border-border bg-secondary/30 p-2 pt-3")}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-[13px] transition-colors",
                  {
                    "bg-accent/15 font-medium text-foreground": activeTab === tab.id,
                    "text-muted-foreground hover:bg-accent/8 hover:text-foreground": activeTab !== tab.id,
                  },
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right: Content */}
          <div className={cn("flex-1 overflow-y-auto p-6")}>
            {activeTab === "general" && <GeneralTab />}
            {activeTab === "terminal" && <TerminalTab />}
            {activeTab === "developer" && <DeveloperTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
