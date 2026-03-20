import { Zap } from "lucide-react";
import type { SkillUsageEntry } from "../../hooks/useSkillUsage";

interface Props {
  data: SkillUsageEntry[];
}

const BAR_COLORS = [
  "bg-fuchsia-400 dark:bg-fuchsia-500",
  "bg-sky-400 dark:bg-sky-500",
  "bg-lime-400 dark:bg-lime-500",
  "bg-rose-400 dark:bg-rose-500",
  "bg-teal-400 dark:bg-teal-500",
  "bg-violet-400 dark:bg-violet-500",
];

export function SkillUsageCard({ data }: Props) {
  if (data.length === 0) return null;

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="liquid-glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-fuchsia-500" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200">
          Skill Usage
        </h3>
        <span className="text-[10px] text-slate-400 dark:text-neutral-600 ml-auto">
          {total} invocations
        </span>
      </div>
      <div className="space-y-2">
        {data.map((d, idx) => (
          <div key={d.skillName}>
            <div className="flex items-center gap-2 text-xs mb-0.5">
              <code className="font-mono text-slate-700 dark:text-neutral-300">
                {d.skillName}
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
    </div>
  );
}
