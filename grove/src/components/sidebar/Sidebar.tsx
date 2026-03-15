import { useState } from "react";
import { Plus } from "lucide-react";
import { useProject } from "../../hooks/useProject";
import ProjectTree from "./ProjectTree";
import AddProjectDialog from "./AddProjectDialog";
import { IconButton } from "../ui/button";
import { cn } from "../../lib/cn";


function Sidebar() {
  const { projects, loading } = useProject();
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className={cn("flex flex-col h-full bg-sidebar")}>
      {/* Header */}
      <div className={cn("flex items-center justify-between border-b border-border px-4 h-9")}>
        <span className={cn("text-xs font-medium uppercase tracking-wider text-muted-foreground")}>
          Projects
        </span>
        <IconButton onClick={() => setShowAddDialog(true)} title="Add project">
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      {showAddDialog && (
        <AddProjectDialog onClose={() => setShowAddDialog(false)} />
      )}

      <div className={cn("flex-1 overflow-y-auto py-2")}>
        {loading ? (
          <div className="space-y-3 px-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <div className="skeleton w-4 h-4 rounded shrink-0" />
                  <div className="skeleton flex-1 h-3.5" />
                </div>
                <div className="ml-8 border-l border-border pl-3 space-y-1">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <div className="skeleton w-3.5 h-3.5 rounded-full shrink-0" />
                    <div className="skeleton h-3" style={{ width: `${60 + i * 10}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <span className="text-xs text-muted-foreground">No projects yet</span>
            <button
              className="text-xs text-accent hover:underline"
              onClick={() => setShowAddDialog(true)}
            >
              Add a project
            </button>
          </div>
        ) : (
          <ProjectTree projects={projects} />
        )}
      </div>
    </div>
  );
}

export default Sidebar;
