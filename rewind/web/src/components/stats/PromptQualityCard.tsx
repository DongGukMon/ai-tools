import { RefreshCw, Tornado, SkipForward } from "lucide-react";
import type { PromptSignal, PromptSignalType } from "../../types";

interface Props {
  signals: PromptSignal[];
  onJumpToEvent: (index: number) => void;
}

const signalConfig: Record<
  PromptSignalType,
  { label: string; icon: typeof RefreshCw; color: string; bgClass: string; borderClass: string }
> = {
  retry: {
    label: "Quick Corrections",
    icon: RefreshCw,
    color: "text-yellow-600 dark:text-yellow-400",
    bgClass: "bg-yellow-50/50 dark:bg-yellow-950/20",
    borderClass: "border-yellow-200/40 dark:border-yellow-800/30",
  },
  spiral: {
    label: "Tool Spirals",
    icon: Tornado,
    color: "text-red-600 dark:text-red-400",
    bgClass: "bg-red-50/50 dark:bg-red-950/20",
    borderClass: "border-red-200/40 dark:border-red-800/30",
  },
  abandon: {
    label: "Abandoned Attempts",
    icon: SkipForward,
    color: "text-orange-600 dark:text-orange-400",
    bgClass: "bg-orange-50/50 dark:bg-orange-950/20",
    borderClass: "border-orange-200/40 dark:border-orange-800/30",
  },
};

export function PromptQualityCard({ signals, onJumpToEvent }: Props) {
  const grouped = {
    retry: signals.filter((s) => s.type === "retry"),
    spiral: signals.filter((s) => s.type === "spiral"),
    abandon: signals.filter((s) => s.type === "abandon"),
  };

  const total = signals.length;

  return (
    <div className="liquid-glass rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200 mb-4">
        Prompt Quality Signals
      </h3>

      {total === 0 ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          No problematic patterns detected
        </p>
      ) : (
        <div className="space-y-4">
          {(Object.entries(grouped) as [PromptSignalType, PromptSignal[]][]).map(
            ([type, items]) => {
              if (items.length === 0) return null;
              const cfg = signalConfig[type];
              const Icon = cfg.icon;
              return (
                <div key={type}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                    <span className={`text-xs font-medium ${cfg.color}`}>
                      {cfg.label} ({items.length})
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {items.slice(0, 10).map((s, i) => (
                      <div
                        key={i}
                        className={`text-xs rounded-lg px-2.5 py-2 border ${cfg.bgClass} ${cfg.borderClass}`}
                      >
                        <p className="font-mono text-slate-600 dark:text-neutral-300 line-clamp-2 mb-1">
                          "{s.promptSnippet}"
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 dark:text-neutral-500">
                            {s.description}
                          </span>
                          <button
                            onClick={() => onJumpToEvent(s.startIndex)}
                            className="ml-auto text-[10px] text-blue-500 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
                          >
                            #{s.startIndex}–{s.endIndex} →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
