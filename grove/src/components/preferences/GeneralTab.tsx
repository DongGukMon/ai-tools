import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  FolderOpen,
  Plus,
  Terminal,
  X,
} from "lucide-react";
import { usePreferencesStore } from "../../store/preferences";
import { cn } from "../../lib/cn";
import type { ProjectViewMode } from "../../types";
import { Button, IconButton } from "../ui/button";
import {
  IDE_REGISTRY,
  buildIdeMenuItem,
  getIdeMenuItemDisplayName,
  getIdeRegistryEntry,
} from "../../lib/ide-registry";
import IdeAppIcon from "../ide/IdeAppIcon";

const PROJECT_VIEW_MODE_OPTIONS: { id: ProjectViewMode; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "group-by-orgs", label: "Group by orgs" },
];

function MenuPreviewRow({
  label,
  icon,
  badge,
  actions,
}: {
  label: string;
  icon: ReactNode;
  badge?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-7 items-center gap-2 rounded-sm px-1.5 text-[11px] text-foreground",
      )}
    >
      {icon}
      <div className={cn("min-w-0 flex flex-1 items-center gap-2")}>
        <div className={cn("truncate font-medium")} title={label}>
          {label}
        </div>
        {badge && (
          <span
            className={cn(
              "shrink-0 rounded-full border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
            )}
          >
            {badge}
          </span>
        )}
      </div>
      {actions && <div className={cn("flex items-center gap-1")}>{actions}</div>}
    </div>
  );
}

export default function GeneralTab() {
  const projectViewMode = usePreferencesStore((s) => s.projectViewMode);
  const setProjectViewMode = usePreferencesStore((s) => s.setProjectViewMode);
  const ideMenuItems = usePreferencesStore((s) => s.ideMenuItems);
  const setIdeMenuItems = usePreferencesStore((s) => s.setIdeMenuItems);

  const selectedIds = new Set(ideMenuItems.map((item) => item.id));
  const availableIdeEntries = IDE_REGISTRY.filter((entry) => !selectedIds.has(entry.id));

  const moveIdeMenuItem = (index: number, offset: -1 | 1) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= ideMenuItems.length) {
      return;
    }

    const nextItems = [...ideMenuItems];
    const [moved] = nextItems.splice(index, 1);
    nextItems.splice(nextIndex, 0, moved);
    setIdeMenuItems(nextItems);
  };

  const addIdeMenuItem = (id: string) => {
    const item = buildIdeMenuItem(id);
    if (!item) {
      return;
    }

    setIdeMenuItems([...ideMenuItems, item]);
  };

  const removeIdeMenuItem = (id: string) => {
    setIdeMenuItems(ideMenuItems.filter((item) => item.id !== id));
  };

  return (
    <div>
      <h3 className={cn("mb-5 text-sm font-semibold text-foreground")}>General</h3>

      <div className={cn("mb-6")}>
        <h4 className={cn("mb-1 text-[12px] font-medium text-foreground")}>
          Project view mode
        </h4>
        <p className={cn("mb-2 text-[11px] text-muted-foreground/70")}>
          Controls how projects are organized in the sidebar
        </p>
        <select
          value={projectViewMode}
          onChange={(e) => setProjectViewMode(e.target.value as ProjectViewMode)}
          className={cn(
            "w-[240px] rounded-md border border-border bg-background px-3 py-1.5 text-[12px] text-foreground",
            "focus:outline-none focus:border-ring transition-colors",
          )}
        >
          {PROJECT_VIEW_MODE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className={cn("border-t border-border mb-6")} />

      <div>
        <h4 className={cn("mb-1 text-[12px] font-medium text-foreground")}>
          IDE menu items
        </h4>
        <p className={cn("mb-4 text-[11px] text-muted-foreground/70")}>
          Choose which IDEs appear in sidebar context menus. Order here becomes
          `Finder` → `Global Terminal` → your selected IDEs.
        </p>

        <div className={cn("space-y-5")}>
          <div className={cn("w-full max-w-[380px] space-y-3")}>
            <div>
              <h5 className={cn("text-[11px] font-medium uppercase tracking-wider text-muted-foreground")}>
                Menu Preview
              </h5>
              <p className={cn("mt-1 text-[11px] text-muted-foreground/70")}>
                Reorder selected IDE items here.
              </p>
            </div>
            <div className={cn("mt-2.5 h-[134px]")}>
              <div
                className={cn(
                  "max-h-full overflow-hidden rounded-md border border-border bg-background p-1 shadow-sm",
                )}
              >
                <div className={cn("menu-preview-scroll max-h-[126px] overflow-y-auto")}>
                  <MenuPreviewRow
                    label="Open in Finder"
                    icon={<FolderOpen className={cn("size-3.5 shrink-0 text-muted-foreground")} />}
                  />
                  <MenuPreviewRow
                    label="Open in Global Terminal"
                    icon={<Terminal className={cn("size-3.5 shrink-0 text-muted-foreground")} />}
                  />
                  {ideMenuItems.map((item, index) => {
                    const entry = getIdeRegistryEntry(item.id);
                    const label = getIdeMenuItemDisplayName(item);
                    return (
                      <MenuPreviewRow
                        key={item.id}
                        label={`Open in ${label}`}
                        badge={item.openCommand ? "Custom" : undefined}
                        icon={
                          <IdeAppIcon
                            iconSrc={entry?.iconSrc}
                            label={label}
                            className={cn("size-3.5")}
                          />
                        }
                        actions={
                          <>
                            <IconButton
                              type="button"
                              className={cn("h-6 w-6")}
                              onClick={() => moveIdeMenuItem(index, -1)}
                              disabled={index === 0}
                              aria-label={`Move ${label} up`}
                            >
                              <ArrowUp className={cn("size-3.5")} />
                            </IconButton>
                            <IconButton
                              type="button"
                              className={cn("h-6 w-6")}
                              onClick={() => moveIdeMenuItem(index, 1)}
                              disabled={index === ideMenuItems.length - 1}
                              aria-label={`Move ${label} down`}
                            >
                              <ArrowDown className={cn("size-3.5")} />
                            </IconButton>
                          </>
                        }
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className={cn("space-y-3")}>
            <div>
              <h5 className={cn("text-[11px] font-medium uppercase tracking-wider text-muted-foreground")}>
                Available IDEs
              </h5>
              <p className={cn("mt-1 text-[11px] text-muted-foreground/70")}>
                Add or remove the editors surfaced in the sidebar context menu.
              </p>
            </div>
            <div className={cn("mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3")}>
              {IDE_REGISTRY.map((entry) => {
                const isSelected = selectedIds.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border border-border/70 bg-background px-2.5 py-2",
                    )}
                  >
                    <IdeAppIcon
                      iconSrc={entry.iconSrc}
                      label={entry.displayName}
                      className={cn("size-8")}
                    />
                    <div className={cn("min-w-0 flex-1")}>
                      <div
                        className={cn("truncate text-[12px] font-medium text-foreground")}
                        title={entry.displayName}
                      >
                        {entry.displayName}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className={cn(
                        "shrink-0 border-0 shadow-none",
                        {
                          "text-muted-foreground/35 hover:text-muted-foreground/70":
                            isSelected,
                        },
                      )}
                      aria-label={
                        isSelected
                          ? `Remove ${entry.displayName} from menu`
                          : `Add ${entry.displayName} to menu`
                      }
                      title={
                        isSelected
                          ? `Remove ${entry.displayName}`
                          : `Add ${entry.displayName}`
                      }
                      onClick={() =>
                        isSelected
                          ? removeIdeMenuItem(entry.id)
                          : addIdeMenuItem(entry.id)
                      }
                    >
                      {isSelected ? (
                        <X className={cn("size-3.5")} />
                      ) : (
                        <Plus className={cn("size-3.5")} />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
            {availableIdeEntries.length === 0 && (
              <p className={cn("mt-2.5 text-[11px] text-muted-foreground/70")}>
                All supported IDEs are already shown in the menu.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
