import { Wrench } from "lucide-react";
import type { ToolUsageEntry } from "../../hooks/useToolUsage";

const BAR_COLORS = [
  "bg-violet-400 dark:bg-violet-500",
  "bg-cyan-400 dark:bg-cyan-500",
  "bg-rose-400 dark:bg-rose-500",
  "bg-emerald-400 dark:bg-emerald-500",
  "bg-amber-400 dark:bg-amber-500",
  "bg-blue-400 dark:bg-blue-500",
  "bg-pink-400 dark:bg-pink-500",
  "bg-teal-400 dark:bg-teal-500",
  "bg-orange-400 dark:bg-orange-500",
  "bg-indigo-400 dark:bg-indigo-500",
];

interface Props {
  data: ToolUsageEntry[];
}

export function ToolUsageCard({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="liquid-glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Wrench className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200">
          Tool Usage
        </h3>
        <span className="text-[10px] text-slate-400 dark:text-neutral-600 ml-auto">
          {total} calls total
        </span>
      </div>

      {data.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-neutral-500">No tool calls</p>
      ) : (
        <div className="space-y-2">
          {data.map((d, idx) => (
            <div key={d.toolName}>
              <div className="flex items-center gap-2 text-xs mb-0.5">
                <code className="font-mono text-slate-700 dark:text-neutral-300">
                  {d.toolName}
                </code>
                <span className="ml-auto font-mono text-slate-500 dark:text-neutral-400">
                  {d.count}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-neutral-500 w-10 text-right">
                  {((d.count / total) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${BAR_COLORS[idx % BAR_COLORS.length]}`}
                  style={{ width: `${d.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
