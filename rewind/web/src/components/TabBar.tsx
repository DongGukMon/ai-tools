import { BarChart3, Clock, Sparkles } from "lucide-react";
import type { TabId } from "../types";

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  hasAnalysis: boolean;
}

const tabs: { id: TabId; label: string; icon: typeof Clock }[] = [
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "analysis", label: "Analysis", icon: Sparkles },
];

export function TabBar({ activeTab, onTabChange, hasAnalysis }: TabBarProps) {
  return (
    <div className="liquid-glass-tabbar inline-flex items-center gap-1 p-1 rounded-2xl">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={`
            relative flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium
            transition-all duration-200 cursor-pointer
            ${
              activeTab === id
                ? "liquid-glass-tab-active text-slate-900 dark:text-neutral-100"
                : "text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-300"
            }
          `}
        >
          <Icon className="w-3.5 h-3.5" />
          <span>{label}</span>
          {id === "analysis" && hasAnalysis && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
          )}
        </button>
      ))}
    </div>
  );
}
