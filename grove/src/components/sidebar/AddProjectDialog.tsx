import { useState } from "react";
import { Plus } from "lucide-react";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import { getCommandErrorMessage } from "../../lib/tauri";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";

interface Props {
  onClose: () => void;
}

function AddProjectDialog({ onClose }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { addProject } = useProjectStore();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }

    setError("");
    setLoading(true);
    try {
      await addProject(trimmed);
      toast("success", "Project cloned successfully");
      onClose();
    } catch (err) {
      setError(getCommandErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("rounded-[24px] border border-white/80 bg-white/85 p-3 shadow-sm backdrop-blur-sm")}>
      <div className={cn("flex items-start gap-3")}>
        <div className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-[18px] bg-[var(--color-primary-light)] text-[var(--color-primary)] shadow-inner")}>
          <Plus className={cn("size-4")} strokeWidth={2.35} />
        </div>

        <div className={cn("min-w-0 flex-1")}>
          <div className={cn("flex items-start justify-between gap-2")}>
            <div className={cn("min-w-0")}>
              <h3 className={cn("text-[13px] font-semibold text-[var(--color-text)]")}>
                Add project source
              </h3>
              <p className={cn("mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)]")}>
                Paste an HTTPS or SSH remote. Grove will clone and track it as the source repo.
              </p>
            </div>
            <Badge
              variant="secondary"
              className={cn("rounded-full border-0 bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]")}
            >
              Clone
            </Badge>
          </div>

          <form onSubmit={handleSubmit} className={cn("mt-3 space-y-3")}>
            <Input
              type="text"
              placeholder="git@github.com:org/repo.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
              disabled={loading}
              className={cn("h-10 rounded-[18px] border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[13px] shadow-none")}
              onKeyDown={(e) => {
                if (e.key === "Escape" && !loading) {
                  onClose();
                }
              }}
            />

            <div className={cn("rounded-[18px] bg-[var(--color-bg-secondary)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]")}>
              Supports `https://github.com/org/repo.git` and `git@github.com:org/repo.git`.
            </div>

            {loading && (
              <div className={cn("flex items-center gap-2 rounded-[18px] bg-[var(--color-primary-light)] px-3 py-2 text-[11px] font-medium text-[var(--color-primary)]")}>
                <Spinner className={cn("size-3.5")} />
                Cloning repository...
              </div>
            )}

            {error && (
              <div className={cn("rounded-[18px] border border-[var(--color-danger-bg)] bg-[var(--color-danger-bg)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-danger)] break-all")}>
                {error}
              </div>
            )}

            <div className={cn("flex items-center justify-end gap-2")}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={loading}
                className={cn("rounded-full border-[var(--color-border)] bg-white px-3 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={loading || !url.trim()}
                className={cn("rounded-full px-3 text-[12px] shadow-sm")}
              >
                {loading ? <Spinner className={cn("size-3.5")} /> : <Plus className={cn("size-3.5")} strokeWidth={2.35} />}
                {loading ? "Cloning..." : "Clone source"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AddProjectDialog;
