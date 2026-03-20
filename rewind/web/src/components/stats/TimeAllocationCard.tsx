import type { TimeAllocation } from "../../types";

interface Props {
  data: TimeAllocation;
}

const segments: { key: keyof TimeAllocation; label: string; color: string; darkColor: string }[] = [
  { key: "userInput", label: "Prompt Processing", color: "bg-indigo-400", darkColor: "dark:bg-indigo-500" },
  { key: "thinking", label: "AI Thinking", color: "bg-emerald-400", darkColor: "dark:bg-emerald-500" },
  { key: "toolExecution", label: "Tool Execution", color: "bg-amber-400", darkColor: "dark:bg-amber-500" },
  { key: "idle", label: "User Between Turns", color: "bg-slate-300", darkColor: "dark:bg-neutral-600" },
];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export function TimeAllocationCard({ data }: Props) {
  const total = data.userInput + data.thinking + data.toolExecution + data.idle;
  if (total === 0) {
    return (
      <div className="liquid-glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200 mb-3">
          Time Allocation
        </h3>
        <p className="text-xs text-slate-500 dark:text-neutral-500">Not enough data</p>
      </div>
    );
  }

  return (
    <div className="liquid-glass rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200 mb-4">
        Time Allocation
      </h3>
      <div className="flex h-4 rounded-full overflow-hidden mb-4">
        {segments.map(({ key, color, darkColor }) => {
          const pct = (data[key] / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={key}
              className={`${color} ${darkColor} transition-all duration-300`}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {segments.map(({ key, label, color, darkColor }) => {
          const pct = total > 0 ? ((data[key] / total) * 100).toFixed(1) : "0";
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className={`w-2.5 h-2.5 rounded-full ${color} ${darkColor}`} />
              <span className="text-slate-600 dark:text-neutral-400">{label}</span>
              <span className="ml-auto font-mono text-slate-800 dark:text-neutral-200">
                {pct}%
              </span>
              <span className="font-mono text-slate-400 dark:text-neutral-500">
                {formatDuration(data[key])}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-slate-400 dark:text-neutral-600">
        Total: {formatDuration(total)} (estimated from event timestamps)
      </p>
    </div>
  );
}
