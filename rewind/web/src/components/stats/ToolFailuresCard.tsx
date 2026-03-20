import { AlertTriangle, RotateCw } from "lucide-react";
import type { ToolFailure, RetryHotspot } from "../../types";

interface Props {
  failures: ToolFailure[];
  retryHotspots: RetryHotspot[];
  onJumpToEvent: (index: number) => void;
}

function EventLink({ index, onJump }: { index: number; onJump: (i: number) => void }) {
  return (
    <button
      onClick={() => onJump(index)}
      className="text-[10px] text-blue-500 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
    >
      #{index} →
    </button>
  );
}

export function ToolFailuresCard({ failures, retryHotspots, onJumpToEvent }: Props) {
  const isEmpty = failures.length === 0 && retryHotspots.length === 0;

  return (
    <div className="liquid-glass rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200 mb-4">
        Tool Failures & Retries
      </h3>

      {isEmpty ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          No failures or retry hotspots detected
        </p>
      ) : (
        <div className="space-y-4">
          {failures.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  Failures ({failures.length})
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {failures.slice(0, 15).map((f) => (
                  <div
                    key={f.index}
                    className="flex items-start gap-2 text-xs rounded-lg px-2.5 py-1.5 bg-red-50/50 dark:bg-red-950/20 border border-red-200/40 dark:border-red-800/30"
                  >
                    <code className="font-mono text-red-700 dark:text-red-300 shrink-0">
                      {f.toolName}
                    </code>
                    <span className="text-slate-500 dark:text-neutral-500 truncate">
                      {f.errorSnippet}
                    </span>
                    <EventLink index={f.index} onJump={onJumpToEvent} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {retryHotspots.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <RotateCw className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Retry Hotspots ({retryHotspots.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {retryHotspots.map((h, i) => (
                  <div
                    key={i}
                    className="text-xs rounded-lg px-2.5 py-1.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/40 dark:border-amber-800/30"
                  >
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-amber-700 dark:text-amber-300">
                        {h.toolName}
                      </code>
                      <span className="text-slate-500 dark:text-neutral-500">
                        {h.count}x consecutively
                      </span>
                      <EventLink index={h.startIndex} onJump={onJumpToEvent} />
                    </div>
                    {h.targets.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {h.targets.map((t, j) => (
                          <span
                            key={j}
                            className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-100/60 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 truncate max-w-[200px]"
                            title={t}
                          >
                            {t.split("/").pop() || t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
