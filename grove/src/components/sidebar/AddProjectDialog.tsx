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
    <div className="add-project-dialog">
      <form onSubmit={handleSubmit}>
        <input
          className="add-project-input"
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
        {error && <div className="add-project-error">{error}</div>}
        <div className="add-project-actions">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading || !url.trim()}>
            {loading ? "Cloning..." : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddProjectDialog;
