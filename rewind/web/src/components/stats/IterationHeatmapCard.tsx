import type { FileHeat } from "../../types";

interface Props {
  data: FileHeat[];
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function IterationHeatmapCard({ data }: Props) {
  return (
    <div className="liquid-glass rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200 mb-4">
        File Iteration Heatmap
      </h3>

      {data.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-neutral-500">
          No repeated file access detected
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((f) => (
            <div key={f.filePath} className="group">
              <div className="flex items-center gap-2 text-xs mb-0.5">
                <span
                  className="font-mono text-slate-700 dark:text-neutral-300 truncate max-w-[200px]"
                  title={f.filePath}
                >
                  {basename(f.filePath)}
                </span>
                <span className="ml-auto font-mono text-slate-500 dark:text-neutral-400 shrink-0">
                  {f.count}x
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${f.percentage}%`,
                    background:
                      f.percentage > 80
                        ? "linear-gradient(90deg, #e879f9, #ec4899)"
                        : f.percentage > 50
                          ? "linear-gradient(90deg, #a78bfa, #e879f9)"
                          : "linear-gradient(90deg, #818cf8, #a78bfa)",
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-400 dark:text-neutral-600 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                {f.filePath}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
