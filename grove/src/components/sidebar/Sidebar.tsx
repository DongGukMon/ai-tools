import { useState } from "react";
import { Plus } from "lucide-react";
import { useProject } from "../../hooks/useProject";
import { useMission } from "../../hooks/useMission";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { PanelModeSwitch } from "./PanelModeSwitch";
import ProjectTree from "./ProjectTree";
import AddProjectDialog from "./AddProjectDialog";
import CreateMissionDialog from "./CreateMissionDialog";
import MissionPanel from "./MissionPanel";
import { IconButton } from "../ui/button";
import { cn } from "../../lib/cn";


function Sidebar() {
  const { projects, loading } = useProject();
  const { loading: missionsLoading } = useMission();
  const sidebarMode = usePanelLayoutStore((s) => s.sidebarMode);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCreateMissionDialog, setShowCreateMissionDialog] = useState(false);

  const isProjectsMode = sidebarMode === "projects";

  return (
    <div className={cn("flex flex-col h-full bg-sidebar")}>
      {/* Header */}
      <div className={cn("flex items-center justify-between border-b border-border px-4 h-9")}>
        <PanelModeSwitch />
        <IconButton
          onClick={() => isProjectsMode ? setShowAddDialog(true) : setShowCreateMissionDialog(true)}
          title={isProjectsMode ? "Add project" : "Create mission"}
        >
          <Plus className={cn("h-3.5 w-3.5")} />
        </IconButton>
      </div>

      {showAddDialog && (
        <AddProjectDialog onClose={() => setShowAddDialog(false)} />
      )}
      {showCreateMissionDialog && (
        <CreateMissionDialog onClose={() => setShowCreateMissionDialog(false)} />
      )}

      <div className={cn("flex-1 overflow-y-auto py-2")}>
        {isProjectsMode ? (
          loading ? (
            <div className={cn("space-y-3 px-2")}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className={cn("px-2 py-1.5")}>
                    <div className={cn("skeleton h-4")} style={{ width: "100%" }} />
                  </div>
                  <div className={cn("ml-5 border-l border-border pl-3 space-y-1")}>
                    <div className={cn("px-2 py-1")}>
                      <div className={cn("skeleton h-3.5")} style={{ width: "100%" }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className={cn("flex flex-col items-center justify-center py-8 gap-2")}>
              <span className={cn("text-xs text-muted-foreground")}>No projects yet</span>
              <button
                className={cn("text-xs text-accent hover:underline")}
                onClick={() => setShowAddDialog(true)}
              >
                Add a project
              </button>
            </div>
          ) : (
            <ProjectTree projects={projects} />
          )
        ) : (
          missionsLoading ? (
            <div className={cn("space-y-3 px-2")}>
              {[1, 2, 3].map((i) => (
                <div key={i} className={cn("px-2 py-1.5")}>
                  <div className={cn("skeleton h-4")} style={{ width: "100%" }} />
                </div>
              ))}
            </div>
          ) : (
            <MissionPanel />
          )
        )}
      </div>
    </div>
  );
}

export default Sidebar;
