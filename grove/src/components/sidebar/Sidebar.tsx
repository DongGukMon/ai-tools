import { useState } from "react";
import { Plus } from "lucide-react";
import { useProject } from "../../hooks/useProject";
import ProjectTree from "./ProjectTree";
import AddProjectDialog from "./AddProjectDialog";
import { Button } from "../ui/button";
import { cn } from "../../lib/cn";


function Sidebar() {
  const { projects, loading } = useProject();
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className={cn("flex flex-col h-full bg-[#f7f8fa] border-r border-[var(--color-border)]")}>
      {/* Header */}
      <div className={cn("flex items-center justify-between px-3 h-[44px] shrink-0")}>
        <span className={cn("text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b8fa3]")}>
          Projects
        </span>
        <Button
          variant="ghost"
          size="icon"
          className={cn("w-[24px] h-[24px] rounded-lg text-[#8b8fa3] hover:text-[var(--color-primary)] hover:bg-white hover:shadow-sm")}
          onClick={() => setShowAddDialog(true)}
          title="Add project"
        >
          <Plus size={15} strokeWidth={2} />
        </Button>
      </div>

      {showAddDialog && (
        <AddProjectDialog onClose={() => setShowAddDialog(false)} />
      )}

      <div className={cn("flex-1 overflow-y-auto px-2 pb-2")}>
        {loading ? (
          <div className={cn("space-y-3 py-3 px-1")}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className={cn("flex items-center gap-2 px-2 h-[34px]")}>
                  <div className={cn("skeleton w-4 h-4 rounded shrink-0")} />
                  <div className={cn("skeleton flex-1 h-3.5")} />
                </div>
                <div className={cn("ml-7 space-y-1")}>
                  <div className={cn("flex items-center gap-2 px-2.5 h-[28px]")}>
                    <div className={cn("skeleton w-3 h-3 rounded-full shrink-0")} />
                    <div className={cn("skeleton h-3")} style={{ width: `${60 + i * 10}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className={cn("flex flex-col items-center justify-center py-8 gap-2")}>
            <span className={cn("text-[12px] text-[#8b8fa3]")}>No projects yet</span>
            <button
              className={cn("text-[12px] text-[var(--color-primary)] hover:underline")}
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
