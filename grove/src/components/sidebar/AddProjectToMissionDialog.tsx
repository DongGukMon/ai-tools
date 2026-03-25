import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useProjectStore } from "../../store/project";
import { useMissionStore } from "../../store/mission";
import { useToast } from "../../store/toast";
import { Button } from "../ui/button";
import { cn } from "../../lib/cn";

interface Props {
  missionId: string;
  existingProjectIds: string[];
  onClose: () => void;
}

function AddProjectToMissionDialog({
  missionId,
  existingProjectIds,
  onClose,
}: Props) {
  const projects = useProjectStore((s) => s.projects);
  const addProject = useMissionStore((s) => s.addProject);
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const available = projects.filter(
    (p) => !existingProjectIds.includes(p.id),
  );

  const handleSelect = async (projectId: string) => {
    setLoading(projectId);
    try {
      await addProject(missionId, projectId);
      toast("success", "Project added to mission");
      onClose();
    } catch {
      // Toasts are handled by the command layer.
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={cn("px-1 py-1")}>
      {available.length === 0 ? (
        <div className={cn("px-2 py-2 text-[11px] text-muted-foreground")}>
          All projects already added
        </div>
      ) : (
        available.map((project) => (
          <button
            key={project.id}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors",
              "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
            onClick={() => handleSelect(project.id)}
            disabled={loading !== null}
          >
            <span className={cn("min-w-0 flex-1 truncate text-left")}>
              {project.org}/{project.repo}
            </span>
            {loading === project.id && (
              <Loader2 className={cn("h-3 w-3 shrink-0 animate-spin")} />
            )}
          </button>
        ))
      )}
      <div className={cn("flex justify-end px-1 pt-1")}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={loading !== null}
          className={cn("text-[11px] h-6")}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default AddProjectToMissionDialog;
