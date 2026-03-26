import { useEffect, useState } from "react";
import type { EnvSyncConfig } from "../../types";
import { getEnvSync, setEnvSync } from "../../lib/platform";
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
  const [enabled, setEnabled] = useState(false);
  const [excludeText, setExcludeText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await getEnvSync(projectId);
        if (cancelled) return;
        if (config) {
          setEnabled(config.enabled);
          setExcludeText(config.exclude_patterns.join("\n"));
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

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const config: EnvSyncConfig = {
        enabled,
        exclude_patterns: excludeText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
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
            <label className={cn("flex items-center gap-2 text-sm")}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className={cn("accent-primary")}
              />
              <span className={cn("text-foreground")}>
                Enable env sync
              </span>
            </label>
            <div className={cn("space-y-1.5")}>
              <label className={cn("text-xs font-medium text-muted-foreground")}>
                Exclude patterns (one per line)
              </label>
              <textarea
                value={excludeText}
                onChange={(e) => setExcludeText(e.target.value)}
                rows={4}
                className={cn(
                  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground",
                  "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring",
                )}
                placeholder={"SECRET_*\nAWS_*"}
              />
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
