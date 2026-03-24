import { X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../../lib/cn";
import { useTabStore } from "../../store/tab";

function AppTabBar() {
  const [tabs, activeTabId, setActiveTab, closeTab] = useTabStore(
    useShallow((s) => [s.tabs, s.activeTabId, s.setActiveTab, s.closeTab]),
  );

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 border-b border-border bg-sidebar px-2 h-9 shrink-0",
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1 px-2.5 h-6 rounded text-xs font-medium transition-colors",
              {
                "bg-accent text-accent-foreground": isActive,
                "text-muted-foreground hover:text-foreground hover:bg-muted":
                  !isActive,
              },
            )}
          >
            <span>{tab.title}</span>
            {tab.closable && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }
                }}
                className={cn(
                  "inline-flex items-center justify-center rounded-sm h-4 w-4",
                  "hover:bg-foreground/10",
                )}
              >
                <X className={cn("h-3 w-3")} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default AppTabBar;
