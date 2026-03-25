import { cn } from "../../lib/cn";
import { usePanelLayoutStore } from "../../store/panel-layout";

export function PanelModeSwitch() {
  const sidebarMode = usePanelLayoutStore((s) => s.sidebarMode);
  const setSidebarMode = usePanelLayoutStore((s) => s.setSidebarMode);

  return (
    <div className={cn("flex bg-[var(--color-bg-tertiary)] rounded p-0.5 text-[11px]")}>
      <button
        className={cn("flex-1 text-center py-0.5 rounded-sm transition-colors", {
          "bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] font-semibold":
            sidebarMode === "projects",
          "text-[var(--color-text-muted)]": sidebarMode !== "projects",
        })}
        onClick={() => setSidebarMode("projects")}
      >
        Projects
      </button>
      <button
        className={cn("flex-1 text-center py-0.5 rounded-sm transition-colors", {
          "bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] font-semibold":
            sidebarMode === "missions",
          "text-[var(--color-text-muted)]": sidebarMode !== "missions",
        })}
        onClick={() => setSidebarMode("missions")}
      >
        Missions
      </button>
    </div>
  );
}
