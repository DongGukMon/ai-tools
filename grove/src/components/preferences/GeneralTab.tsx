import { usePreferencesStore } from "../../store/preferences";
import { cn } from "../../lib/cn";
import type { PreferredIde } from "../../types";

const IDE_OPTIONS: { id: string; displayName: string }[] = [
  { id: "vscode", displayName: "Visual Studio Code" },
  { id: "cursor", displayName: "Cursor" },
  { id: "windsurf", displayName: "Windsurf" },
  { id: "webstorm", displayName: "WebStorm" },
  { id: "intellij", displayName: "IntelliJ IDEA" },
  { id: "zed", displayName: "Zed" },
  { id: "sublime", displayName: "Sublime Text" },
  { id: "vim", displayName: "Vim" },
  { id: "neovim", displayName: "Neovim" },
];

export default function GeneralTab() {
  const preferredIde = usePreferencesStore((s) => s.preferredIde);
  const setPreferredIde = usePreferencesStore((s) => s.setPreferredIde);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) {
      setPreferredIde(null);
      return;
    }
    const option = IDE_OPTIONS.find((o) => o.id === id);
    if (option) {
      const ide: PreferredIde = { id: option.id, displayName: option.displayName };
      setPreferredIde(ide);
    }
  };

  return (
    <div>
      <h3 className={cn("text-sm font-semibold text-foreground mb-6")}>General</h3>

      <div>
        <h4 className={cn("text-[12px] font-medium text-foreground mb-1.5")}>
          Preferred IDE
        </h4>
        <p className={cn("text-[11px] text-muted-foreground/70 mb-2")}>
          IDE to open projects with
        </p>
        <select
          value={preferredIde?.id ?? ""}
          onChange={handleChange}
          className={cn(
            "w-[240px] rounded-md border border-border bg-background px-3 py-1.5 text-[12px] text-foreground",
            "focus:outline-none focus:border-ring transition-colors",
          )}
        >
          <option value="">None</option>
          {IDE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.displayName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
