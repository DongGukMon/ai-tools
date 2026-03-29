import { useState } from "react";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import { getCommandErrorMessage } from "../../lib/platform";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { cn } from "../../lib/cn";

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
    if (!trimmed) return;

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
    <div className={cn("px-3 py-3 border-b border-[var(--color-border)]")}>
      <form onSubmit={handleSubmit}>
        <Input
          type="text"
          placeholder="git@github.com:org/repo.git"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
          disabled={loading}
          className="mb-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        <div className={cn("text-[11px] text-[var(--color-text-tertiary)] mb-2 leading-relaxed")}>
          Supports HTTPS and SSH Git URLs.
        </div>
        {loading && (
          <div className={cn("text-[11px] text-[var(--color-text-muted)] mb-2 animate-pulse")}>
            Cloning repository...
          </div>
        )}
        {error && (
          <div className={cn("text-[11px] text-[var(--color-danger)] mb-2 break-all leading-relaxed")}>
            {error}
          </div>
        )}
        <div className={cn("flex gap-2 justify-end")}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={loading}
            className="text-[var(--color-text-secondary)]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={loading || !url.trim()}
            className={cn({ "animate-pulse-subtle": loading })}
          >
            {loading ? "Cloning..." : "Add"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default AddProjectDialog;
