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

export default function EnvSyncDialog({ projectId, resolve, close }: Props) {
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
    <Dialog open onClose={close} title="Env Sync Settings" className="max-w-sm">
      <div className={cn("space-y-4")}>
        {loading ? (
          <p className={cn("text-sm text-muted-foreground animate-pulse")}>
            Loading...
          </p>
        ) : (
          <>
            <div className={cn("space-y-1.5")}>
              <label className={cn("text-xs font-medium text-muted-foreground")}>
                Include items
              </label>
              {entries.length === 0 ? (
                <p className={cn("text-xs text-muted-foreground")}>
                  No .gitignore patterns found
                </p>
              ) : (
                <div
                  className={cn(
                    "max-h-48 overflow-y-auto rounded-md border border-border bg-background p-2 space-y-1",
                  )}
                >
                  {entries.map((entry) => (
                    <label
                      key={entry}
                      className={cn("flex items-center gap-2 text-sm cursor-pointer")}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(entry)}
                        onChange={() => toggleEntry(entry)}
                        className={cn("accent-primary")}
                      />
                      <span className={cn("text-foreground truncate")}>{entry}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {error && (
              <p className={cn("text-xs text-destructive")}>{error}</p>
            )}
          </>
        )}
        <div className={cn("flex justify-end gap-2")}>
          <Button variant="ghost" size="sm" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={loading || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
