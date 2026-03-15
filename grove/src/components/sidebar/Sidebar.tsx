import { useState } from "react";
import { useProject } from "../../hooks/useProject";
import ProjectTree from "./ProjectTree";
import AddProjectDialog from "./AddProjectDialog";

function Sidebar() {
  const { projects, loading } = useProject();
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Projects</span>
        <button
          className="sidebar-add-btn"
          onClick={() => setShowAddDialog(true)}
          title="Add project"
        >
          +
        </button>
      </div>
      {showAddDialog && (
        <AddProjectDialog onClose={() => setShowAddDialog(false)} />
      )}
      {loading ? (
        <div className="sidebar-loading">Loading...</div>
      ) : (
        <ProjectTree projects={projects} />
      )}
    </div>
  );
}

export default Sidebar;
