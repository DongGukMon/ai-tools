import { useState } from "react";
import { useProjectStore } from "../../store/project";

interface Props {
  onClose: () => void;
}

function AddProjectDialog({ onClose }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { addProject } = useProjectStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setError("");
    setLoading(true);
    try {
      await addProject(trimmed);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-3 py-3 border-b border-[var(--color-border)]">
      <form onSubmit={handleSubmit}>
        <input
          className="w-full px-3 py-[7px] text-[13px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] transition-all duration-150 placeholder:text-[var(--color-text-muted)] mb-2"
          type="text"
          placeholder="https://github.com/org/repo.git"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        {error && (
          <div className="text-[11px] text-[var(--color-danger)] mb-2 break-all leading-relaxed">
            {error}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-[5px] text-[12px] font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors duration-100"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`px-3 py-[5px] text-[12px] font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-100 shadow-[var(--shadow-xs)] ${loading ? "animate-pulse-subtle" : ""}`}
            disabled={loading || !url.trim()}
          >
            {loading ? "Cloning..." : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddProjectDialog;
