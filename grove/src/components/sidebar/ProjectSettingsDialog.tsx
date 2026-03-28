import { useEffect, useState } from "react";
import type { EnvSyncConfig } from "../../types";
import { getEnvSync, setEnvSync, listGitignorePatterns } from "../../lib/platform";
import { getCommandErrorMessage } from "../../lib/platform";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { cn } from "../../lib/cn";

interface Props {
  projectId: string;
  resolve: (value: boolean) => void;
  close: () => void;
}

export default function ProjectSettingsDialog({ projectId, resolve, close }: Props) {
  const [entries, setEntries] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [config, gitignored] = await Promise.all([
          getEnvSync(projectId),
          listGitignorePatterns(projectId),
        ]);
        if (cancelled) return;
        setEntries(gitignored);
        if (config) {
          setSelected(new Set(config.include_patterns));
        }
      } catch (err) {
        if (!cancelled) setError(getCommandErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const toggleEntry = (entry: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entry)) {
        next.delete(entry);
      } else {
        next.add(entry);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const config: EnvSyncConfig = {
        include_patterns: Array.from(selected).sort(),
      };
      await setEnvSync(projectId, config);
      resolve(true);
    } catch (err) {
      setError(getCommandErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={close} title="Project Settings" className="max-w-sm">
      <div className={cn("flex min-h-[200px] flex-col")}>
        <div className={cn("space-y-1")}>
          <h3 className={cn("text-[13px] font-medium text-foreground")}>Env Sync</h3>
          <p className={cn("text-[12px] leading-relaxed text-muted-foreground")}>
            Select .gitignore patterns to copy into new worktrees.
          </p>
        </div>

        <div className={cn("mt-3 flex-1")}>
          {loading && (
            <div
              className={cn(
                "rounded-[var(--radius-md)] border border-border p-1.5",
              )}
            >
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-[7px]",
                  )}
                >
                  <div
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 rounded-[3px] bg-secondary",
                    )}
                  />
                  <div
                    className={cn("h-3.5 rounded-[3px] bg-secondary")}
                    style={{ width: `${45 + i * 12}%` }}
                  />
                </div>
              ))}
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div
              className={cn(
                "flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-border py-10",
              )}
            >
              <p
                className={cn(
                  "text-[13px] text-muted-foreground/60 select-none",
                )}
              >
                No .gitignore patterns found.
              </p>
            </div>
          )}

          {!loading && entries.length > 0 && (
            <div
              className={cn(
                "max-h-52 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-secondary/20 p-1",
              )}
            >
              {entries.map((entry) => (
                <label
                  key={entry}
                  className={cn(
                    "group/row flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-[7px]",
                    "cursor-pointer select-none transition-colors",
                    {
                      "bg-accent/8 text-foreground": selected.has(entry),
                      "text-muted-foreground hover:bg-secondary/60 hover:text-foreground":
                        !selected.has(entry),
                    },
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(entry)}
                    onChange={() => toggleEntry(entry)}
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 cursor-pointer accent-ring",
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-mono text-[13px]",
                    )}
                  >
                    {entry}
                  </span>
                </label>
              ))}
            </div>
          )}

          {error && (
            <p className={cn("mt-2 text-[12px] text-destructive")}>
              {error}
            </p>
          )}
        </div>

        <div
          className={cn(
            "mt-4 flex items-center justify-end gap-2 border-t border-border pt-4",
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            className={cn("cursor-pointer")}
            onClick={close}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            className={cn("cursor-pointer")}
            onClick={handleSave}
            disabled={loading || saving || entries.length === 0}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
