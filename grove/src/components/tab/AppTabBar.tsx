import { useCallback, useState } from "react";
import { Globe, Plus, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { IconButton } from "../ui/button";
import {
  useTabStore,
  selectActiveTabIdForWorktree,
  selectTabsForWorktree,
} from "../../store/tab";
import { useProjectStore } from "../../store/project";
import type { AppTabType } from "../../types";

const ADD_TAB_OPTIONS: { type: Exclude<AppTabType, "terminal" | "changes">; label: string; icon: typeof Globe }[] = [
  { type: "browser", label: "Browser", icon: Globe },
];

function AppTabBar() {
  const selectedWorktreePath = useProjectStore((s) => s.selectedWorktree?.path ?? null);
  const tabs = useTabStore((state) => selectTabsForWorktree(state, selectedWorktreePath));
  const activeTabId = useTabStore((state) =>
    selectActiveTabIdForWorktree(state, selectedWorktreePath),
  );
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const addTab = useTabStore((s) => s.addTab);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleAddTab = useCallback(
    (type: Exclude<AppTabType, "terminal">, label: string) => {
      addTab(type, label);
      setMenuOpen(false);
    },
    [addTab],
  );

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 h-9 shrink-0 min-w-0 border-b border-border bg-sidebar",
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
              "group flex items-center gap-1.5 h-6 px-2 rounded-md shrink-0 text-xs font-medium",
              "backdrop-blur-sm border border-white/10 shadow-sm transition-all duration-200 ease-out",
              {
                "bg-white/15 text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.15)] -translate-y-0.5 scale-105": isActive,
                "bg-white/30 text-muted-foreground border-white/45 shadow-[0_1px_6px_rgba(0,0,0,0.3)] translate-y-0 scale-100 hover:-translate-y-0.5 hover:scale-105 hover:bg-white/35 hover:text-foreground hover:shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.15)]": !isActive,
              },
            )}
          >
            <span>{tab.title}</span>
            {tab.closable && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className={cn(
                  "shrink-0 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted",
                  { "opacity-100": isActive },
                )}
              >
                <X className={cn("size-2.5")} />
              </span>
            )}
          </button>
        );
      })}

      {/* Add tab dropdown */}
      <div className={cn("relative shrink-0")}>
        <IconButton
          onClick={() => setMenuOpen((v) => !v)}
          onBlur={() => {
            setTimeout(() => setMenuOpen(false), 150);
          }}
          title="Add tab"
          aria-label="Add tab"
        >
          <Plus className={cn("size-3")} />
        </IconButton>
        {menuOpen && (
          <div
            className={cn(
              "absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-md",
            )}
          >
            {ADD_TAB_OPTIONS.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleAddTab(type, label)}
                className={cn(
                  "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-xs",
                  "text-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                )}
              >
                <Icon className={cn("h-3.5 w-3.5")} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AppTabBar;
