# Grove Preferences Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified Preferences modal to Grove, accessed from a gear button in the AppTabBar, consolidating the existing ThemeSettings slide panel and exposing preferences (link open mode, preferred IDE) that previously had no UI.

**Architecture:** A `PreferencesModal` component using Radix Dialog with a 2-pane layout (left tab nav + right content). Triggered from AppTabBar via the overlay system. The existing `ThemeSettings` slide panel and its toolbar button are removed; all theme editing moves into the Terminal tab of the new modal. Data flows through existing Zustand stores and Tauri commands — no backend changes needed.

**Tech Stack:** React 19, TypeScript, Radix UI Dialog, Zustand, Tailwind CSS v4, lucide-react

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/components/preferences/PreferencesModal.tsx` | Modal shell: 2-pane layout, tab navigation, open/close |
| Create | `src/components/preferences/GeneralTab.tsx` | General tab: Preferred IDE selector |
| Create | `src/components/preferences/TerminalTab.tsx` | Terminal tab: Link Open Mode selector + Appearance section |
| Create | `src/components/preferences/TerminalAppearance.tsx` | Appearance section: theme presets, font, colors (extracted from ThemeSettings) |
| Modify | `src/components/tab/AppTabBar.tsx` | Add gear button in right section |
| Modify | `src/components/terminal/TerminalToolbar.tsx` | Remove ThemeSettings import and rendering |
| Modify | `src/lib/terminal-command-registry.ts` | Remove `terminal-settings` command entry |
| Modify | `src/lib/terminal-command-pipeline.ts` | Remove `open-theme-settings` UI step type |
| Modify | `src/hooks/useTerminalCommandPipeline.ts` | Remove `openThemeSettings` from context |
| Modify | `src/lib/terminal-command-pipeline.test.ts` | Remove theme settings test, update context helper |
| Delete | `src/components/terminal/ThemeSettings.tsx` | Replaced by PreferencesModal > TerminalTab > TerminalAppearance |

---

### Task 1: Create PreferencesModal shell

**Files:**
- Create: `grove/src/components/preferences/PreferencesModal.tsx`

- [ ] **Step 1: Create the modal component**

```tsx
// grove/src/components/preferences/PreferencesModal.tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { cn } from "../../lib/cn";
import GeneralTab from "./GeneralTab";
import TerminalTab from "./TerminalTab";

type TabId = "general" | "terminal";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "terminal", label: "Terminal" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PreferencesModal({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className={cn(
          "gap-0 p-0 sm:max-w-2xl overflow-hidden",
        )}
        showCloseButton
      >
        <DialogTitle className={cn("sr-only")}>Preferences</DialogTitle>
        <DialogDescription className={cn("sr-only")}>
          Application preferences
        </DialogDescription>
        <div className={cn("flex h-[480px]")}>
          {/* Left: Tab Navigation */}
          <nav className={cn("flex w-[160px] shrink-0 flex-col gap-0.5 border-r border-border bg-secondary/30 p-2 pt-3")}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-[13px] transition-colors",
                  {
                    "bg-accent/15 font-medium text-foreground": activeTab === tab.id,
                    "text-muted-foreground hover:bg-accent/8 hover:text-foreground": activeTab !== tab.id,
                  },
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right: Content */}
          <div className={cn("flex-1 overflow-y-auto p-6")}>
            {activeTab === "general" && <GeneralTab />}
            {activeTab === "terminal" && <TerminalTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create placeholder GeneralTab**

```tsx
// grove/src/components/preferences/GeneralTab.tsx
export default function GeneralTab() {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-4">General</h3>
      <p className="text-xs text-muted-foreground">Preferred IDE setting goes here.</p>
    </div>
  );
}
```

- [ ] **Step 3: Create placeholder TerminalTab**

```tsx
// grove/src/components/preferences/TerminalTab.tsx
export default function TerminalTab() {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-4">Terminal</h3>
      <p className="text-xs text-muted-foreground">Link open mode and appearance settings go here.</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd grove && pnpm lint`
Expected: No errors in new files

- [ ] **Step 5: Commit**

```bash
git add grove/src/components/preferences/
git commit -m "feat(grove): add PreferencesModal shell with tab navigation"
```

---

### Task 2: Add gear button to AppTabBar

**Files:**
- Modify: `grove/src/components/tab/AppTabBar.tsx`

- [ ] **Step 1: Import Settings icon and PreferencesModal, add state**

Add to imports at top of `AppTabBar.tsx`:

```tsx
import { GitPullRequest, Globe, Loader2, Plus, Settings, X } from "lucide-react";
```

Add inside the `AppTabBar` function, after the existing `useState(false)` for `menuOpen`:

```tsx
const [preferencesOpen, setPreferencesOpen] = useState(false);
```

Add import for PreferencesModal:

```tsx
import PreferencesModal from "../preferences/PreferencesModal";
```

- [ ] **Step 2: Add gear button before SelectedWorktreePrAction**

Insert between the add-tab dropdown `</div>` (line 256) and `<SelectedWorktreePrAction` (line 258):

```tsx
      <IconButton
        onClick={() => setPreferencesOpen(true)}
        title="Preferences"
        aria-label="Preferences"
      >
        <Settings className={cn("size-3")} />
      </IconButton>
```

- [ ] **Step 3: Render PreferencesModal at the end of the component**

Change the return to wrap with a fragment, and add the modal after the outer `div`:

```tsx
  return (
    <>
      <div className={cn("flex items-center gap-1.5 px-2 h-9 shrink-0 min-w-0 border-b border-border bg-sidebar")}>
        {/* ... existing content ... */}
      </div>
      <PreferencesModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
      />
    </>
  );
```

- [ ] **Step 4: Verify it compiles and renders**

Run: `cd grove && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add grove/src/components/tab/AppTabBar.tsx
git commit -m "feat(grove): add preferences gear button to AppTabBar"
```

---

### Task 3: Implement GeneralTab — Preferred IDE selector

**Files:**
- Modify: `grove/src/components/preferences/GeneralTab.tsx`

- [ ] **Step 1: Implement the Preferred IDE dropdown**

```tsx
// grove/src/components/preferences/GeneralTab.tsx
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
        <label className={cn("block text-[12px] text-muted-foreground mb-1.5")}>
          Preferred IDE
        </label>
        <p className={cn("text-[11px] text-muted-foreground/70 mb-2")}>
          프로젝트를 열 때 사용할 IDE
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd grove && pnpm lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add grove/src/components/preferences/GeneralTab.tsx
git commit -m "feat(grove): implement GeneralTab with Preferred IDE selector"
```

---

### Task 4: Implement TerminalTab — Link Open Mode selector

**Files:**
- Modify: `grove/src/components/preferences/TerminalTab.tsx`

- [ ] **Step 1: Implement the Link Open Mode dropdown + Appearance placeholder**

```tsx
// grove/src/components/preferences/TerminalTab.tsx
import { usePreferencesStore } from "../../store/preferences";
import { cn } from "../../lib/cn";
import type { TerminalLinkOpenMode } from "../../types";
import TerminalAppearance from "./TerminalAppearance";

const LINK_OPEN_OPTIONS: {
  value: TerminalLinkOpenMode;
  label: string;
  description: string;
}[] = [
  {
    value: "external",
    label: "External Browser",
    description: "모든 링크를 외부 브라우저에서 열기",
  },
  {
    value: "internal",
    label: "Grove Browser",
    description: "모든 링크를 Grove 내장 브라우저에서 열기",
  },
  {
    value: "external-with-localhost-internal",
    label: "Localhost in Grove, others External",
    description: "localhost 링크만 내장 브라우저, 나머지는 외부 브라우저",
  },
];

export default function TerminalTab() {
  const terminalLinkOpenMode = usePreferencesStore((s) => s.terminalLinkOpenMode);
  const setTerminalLinkOpenMode = usePreferencesStore((s) => s.setTerminalLinkOpenMode);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTerminalLinkOpenMode(e.target.value as TerminalLinkOpenMode);
  };

  return (
    <div>
      <h3 className={cn("text-sm font-semibold text-foreground mb-6")}>Terminal</h3>

      {/* Link Open Mode */}
      <div className={cn("mb-6")}>
        <label className={cn("block text-[12px] text-muted-foreground mb-1.5")}>
          Link Open Mode
        </label>
        <p className={cn("text-[11px] text-muted-foreground/70 mb-2")}>
          터미널에서 링크를 클릭할 때 열리는 위치
        </p>
        <select
          value={terminalLinkOpenMode}
          onChange={handleChange}
          className={cn(
            "w-[320px] rounded-md border border-border bg-background px-3 py-1.5 text-[12px] text-foreground",
            "focus:outline-none focus:border-ring transition-colors",
          )}
        >
          {LINK_OPEN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} — {opt.description}
            </option>
          ))}
        </select>
      </div>

      {/* Divider */}
      <div className={cn("border-t border-border mb-6")} />

      {/* Appearance */}
      <TerminalAppearance />
    </div>
  );
}
```

- [ ] **Step 2: Create TerminalAppearance placeholder**

```tsx
// grove/src/components/preferences/TerminalAppearance.tsx
import { cn } from "../../lib/cn";

export default function TerminalAppearance() {
  return (
    <div>
      <h4 className={cn("text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-4")}>
        Appearance
      </h4>
      <p className={cn("text-xs text-muted-foreground")}>Theme settings will be migrated here.</p>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd grove && pnpm lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add grove/src/components/preferences/TerminalTab.tsx grove/src/components/preferences/TerminalAppearance.tsx
git commit -m "feat(grove): implement TerminalTab with Link Open Mode selector"
```

---

### Task 5: Migrate ThemeSettings into TerminalAppearance

**Files:**
- Modify: `grove/src/components/preferences/TerminalAppearance.tsx`

This task extracts the theme editing UI from `ThemeSettings.tsx` into `TerminalAppearance.tsx`. The key differences from the original:
- No slide animation, backdrop, or panel wrapper (the modal handles that)
- No header/footer with close/apply buttons — changes auto-persist
- Keeps: presets, font settings, core colors, ANSI colors, preview

- [ ] **Step 1: Implement TerminalAppearance with full theme editing**

```tsx
// grove/src/components/preferences/TerminalAppearance.tsx
import { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import {
  terminalThemes,
  themeDisplayNames,
  DEFAULT_THEME_KEY,
} from "../../lib/terminal-themes";
import { useTerminalStore } from "../../store/terminal";
import { saveAppConfig, getAppConfig } from "../../lib/platform";
import { runCommandSafely } from "../../lib/command";
import { Button } from "../ui/button";
import { cn } from "../../lib/cn";
import type { TerminalTheme } from "../../types";

const ANSI_LABELS: { key: keyof TerminalTheme; label: string }[] = [
  { key: "black", label: "Black" },
  { key: "red", label: "Red" },
  { key: "green", label: "Green" },
  { key: "yellow", label: "Yellow" },
  { key: "blue", label: "Blue" },
  { key: "magenta", label: "Magenta" },
  { key: "cyan", label: "Cyan" },
  { key: "white", label: "White" },
  { key: "brightBlack", label: "Bright Black" },
  { key: "brightRed", label: "Bright Red" },
  { key: "brightGreen", label: "Bright Green" },
  { key: "brightYellow", label: "Bright Yellow" },
  { key: "brightBlue", label: "Bright Blue" },
  { key: "brightMagenta", label: "Bright Magenta" },
  { key: "brightCyan", label: "Bright Cyan" },
  { key: "brightWhite", label: "Bright White" },
];

export default function TerminalAppearance() {
  const theme = useTerminalStore((s) => s.theme);
  const detectedTheme = useTerminalStore((s) => s.detectedTheme);
  const loadTheme = useTerminalStore((s) => s.loadTheme);

  const [draft, setDraft] = useState<TerminalTheme | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [colorsOpen, setColorsOpen] = useState(false);

  useEffect(() => {
    if (theme) {
      setDraft({ ...theme });
      const allPresets: [string, TerminalTheme][] = [
        ...Object.entries(terminalThemes),
        ...(detectedTheme ? [["system", detectedTheme] as [string, TerminalTheme]] : []),
      ];
      const match = allPresets.find(
        ([, preset]) => preset.background === theme.background && preset.foreground === theme.foreground,
      );
      setActivePreset(match ? match[0] : null);
    }
  }, [theme, detectedTheme]);

  const updateDraft = useCallback(
    (key: keyof TerminalTheme, value: string | number) => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
      setActivePreset(null);
    },
    [],
  );

  const selectPreset = useCallback((key: string) => {
    const preset = key === "system" ? detectedTheme : terminalThemes[key];
    if (!preset) return;
    setDraft((prev) => ({
      ...preset,
      fontFamily: prev?.fontFamily ?? preset.fontFamily,
      fontSize: prev?.fontSize ?? preset.fontSize,
    }));
    setActivePreset(key);
  }, [detectedTheme]);

  const handleApply = useCallback(async () => {
    if (!draft) return;
    loadTheme(draft);
    await runCommandSafely(async () => {
      const config = await getAppConfig();
      await saveAppConfig({ ...config, terminalTheme: draft });
    }, {
      errorToast: "Failed to save terminal theme",
    });
  }, [draft, loadTheme]);

  const handleReset = useCallback(() => {
    if (detectedTheme) {
      setDraft({ ...detectedTheme });
      setActivePreset("system");
    } else {
      setDraft({ ...terminalThemes[DEFAULT_THEME_KEY] });
      setActivePreset(DEFAULT_THEME_KEY);
    }
  }, [detectedTheme]);

  if (!draft) return null;

  return (
    <div>
      <h4 className={cn("text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-4")}>
        Appearance
      </h4>

      <div className={cn("flex flex-col gap-5")}>
        {/* Preset Themes */}
        <section>
          <h3 className={cn("text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2")}>
            Presets
          </h3>
          <div className={cn("grid grid-cols-3 gap-1.5")}>
            {[
              ...(detectedTheme ? [["system", "System"] as const] : []),
              ...Object.entries(themeDisplayNames),
            ].map(([key, name]) => {
              const preset = key === "system" ? detectedTheme : terminalThemes[key];
              if (!preset) return null;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectPreset(key)}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-md)] border text-left transition-colors",
                    {
                      "border-[var(--color-primary)] bg-[var(--color-primary-light)]":
                        activePreset === key,
                      "border-[var(--color-border)] hover:border-[var(--color-primary-border)] hover:bg-[var(--color-bg-secondary)]":
                        activePreset !== key,
                    },
                  )}
                >
                  <div
                    className={cn("w-5 h-5 rounded-[3px] border border-[var(--color-border)] shrink-0")}
                    style={{ backgroundColor: preset.background }}
                  >
                    <span
                      className={cn("block text-[8px] leading-[20px] text-center font-bold")}
                      style={{ color: preset.foreground }}
                    >
                      A
                    </span>
                  </div>
                  <span className={cn("text-[12px] text-[var(--color-text)] truncate")}>
                    {name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Font Settings */}
        <section>
          <h3 className={cn("text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2")}>
            Font
          </h3>
          <div className={cn("flex flex-col gap-2.5")}>
            <div>
              <label className={cn("block text-[11px] text-[var(--color-text-secondary)] mb-1")}>
                Font Family
              </label>
              <input
                type="text"
                value={draft.fontFamily}
                onChange={(e) => updateDraft("fontFamily", e.target.value)}
                className={cn("w-full max-w-[280px] px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] transition-colors")}
              />
            </div>
            <div>
              <div className={cn("flex items-center justify-between mb-1 max-w-[280px]")}>
                <label className={cn("text-[11px] text-[var(--color-text-secondary)]")}>
                  Font Size
                </label>
                <span className={cn("text-[11px] text-[var(--color-text-tertiary)] tabular-nums")}>
                  {draft.fontSize}px
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={20}
                step={1}
                value={draft.fontSize}
                onChange={(e) =>
                  updateDraft("fontSize", Number(e.target.value))
                }
                className={cn("w-full max-w-[280px] h-1 accent-[var(--color-primary)] cursor-pointer")}
              />
            </div>
          </div>
        </section>

        {/* Core Colors */}
        <section>
          <h3 className={cn("text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2")}>
            Colors
          </h3>
          <div className={cn("flex flex-col gap-2")}>
            <ColorRow label="Background" value={draft.background} onChange={(v) => updateDraft("background", v)} />
            <ColorRow label="Foreground" value={draft.foreground} onChange={(v) => updateDraft("foreground", v)} />
            <ColorRow label="Cursor" value={draft.cursor} onChange={(v) => updateDraft("cursor", v)} />
          </div>
        </section>

        {/* ANSI Colors (collapsible) */}
        <section>
          <button
            type="button"
            onClick={() => setColorsOpen((v) => !v)}
            className={cn("flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider hover:text-[var(--color-text-secondary)] transition-colors mb-2")}
          >
            {colorsOpen ? (
              <ChevronDown size={12} strokeWidth={2} />
            ) : (
              <ChevronRight size={12} strokeWidth={2} />
            )}
            ANSI Colors
          </button>
          {colorsOpen && (
            <div className={cn("flex flex-col gap-2")}>
              {ANSI_LABELS.map(({ key, label }) => (
                <ColorRow
                  key={key}
                  label={label}
                  value={draft[key] as string}
                  onChange={(v) => updateDraft(key, v)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Preview */}
        <section>
          <h3 className={cn("text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2")}>
            Preview
          </h3>
          <div
            className={cn("rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-[12px] leading-[1.6] overflow-hidden")}
            style={{
              backgroundColor: draft.background,
              color: draft.foreground,
              fontFamily: draft.fontFamily,
              fontSize: `${draft.fontSize}px`,
            }}
          >
            <div>
              <span style={{ color: draft.green }}>user</span>
              <span style={{ color: draft.foreground }}>@</span>
              <span style={{ color: draft.blue }}>grove</span>
              <span style={{ color: draft.foreground }}> ~ $ </span>
              <span style={{ color: draft.foreground }}>echo </span>
              <span style={{ color: draft.yellow }}>&quot;Hello, World!&quot;</span>
            </div>
            <div style={{ color: draft.foreground }}>Hello, World!</div>
            <div>
              <span style={{ color: draft.red }}>error:</span>
              <span style={{ color: draft.foreground }}> something went wrong</span>
            </div>
            <div>
              <span style={{ color: draft.cyan }}>info:</span>
              <span style={{ color: draft.foreground }}> task completed</span>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className={cn("flex items-center gap-2")}>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw size={12} strokeWidth={1.5} />
            Reset
          </Button>
          <Button size="sm" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2 max-w-[280px]")}>
      <span className={cn("text-[11px] text-[var(--color-text-secondary)]")}>
        {label}
      </span>
      <div className={cn("flex items-center gap-1.5")}>
        <span className={cn("text-[10px] text-[var(--color-text-tertiary)] font-mono tabular-nums uppercase")}>
          {value}
        </span>
        <label className={cn("relative w-5 h-5 rounded-[3px] border border-[var(--color-border)] cursor-pointer overflow-hidden shrink-0")}>
          <div className={cn("absolute inset-0")} style={{ backgroundColor: value }} />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn("absolute inset-0 w-full h-full opacity-0 cursor-pointer")}
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd grove && pnpm lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add grove/src/components/preferences/TerminalAppearance.tsx
git commit -m "feat(grove): migrate ThemeSettings into TerminalAppearance component"
```

---

### Task 6: Remove old ThemeSettings and clean up terminal command pipeline

**Files:**
- Delete: `grove/src/components/terminal/ThemeSettings.tsx`
- Modify: `grove/src/components/terminal/TerminalToolbar.tsx`
- Modify: `grove/src/lib/terminal-command-registry.ts`
- Modify: `grove/src/lib/terminal-command-pipeline.ts`
- Modify: `grove/src/hooks/useTerminalCommandPipeline.ts`
- Modify: `grove/src/lib/terminal-command-pipeline.test.ts`

- [ ] **Step 1: Rewrite TerminalToolbar to remove ThemeSettings**

Replace entire file:

```tsx
// grove/src/components/terminal/TerminalToolbar.tsx
import { Columns2, Play, Rows2, ScreenShare, X } from "lucide-react";
import { useTerminalCommandPipeline } from "../../hooks/useTerminalCommandPipeline";
import type { TerminalCommandDefinition } from "../../lib/terminal-command-pipeline";
import { IconButton } from "../ui/button";
import { cn } from "../../lib/cn";

const terminalCommandIcons = {
  mirror: ScreenShare,
  "split-horizontal": Columns2,
  "split-vertical": Rows2,
  close: X,
  play: Play,
} satisfies Record<TerminalCommandDefinition["icon"], typeof ScreenShare>;

export default function TerminalToolbar() {
  const { commands, executeCommand, isCommandEnabled } =
    useTerminalCommandPipeline();

  return (
    <div className={cn("flex items-center justify-end border-b border-border bg-sidebar px-2 h-9 shrink-0")}>
      <div className={cn("flex items-center gap-1")}>
        {commands.map((command) => {
          const Icon = terminalCommandIcons[command.icon];
          return (
            <IconButton
              key={command.id}
              className={cn("h-7 w-7")}
              onClick={() => {
                executeCommand(command).catch(() => {});
              }}
              disabled={!isCommandEnabled(command)}
              title={command.title}
            >
              <Icon className={cn("h-3.5 w-3.5")} />
            </IconButton>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remove `terminal-settings` from command registry**

In `grove/src/lib/terminal-command-registry.ts`, remove the first entry from `TERMINAL_TOOLBAR_COMMANDS`:

```ts
// Remove this entire block (lines 8-14):
//   {
//     id: "terminal-settings",
//     label: "Theme settings",
//     title: "Terminal Theme Settings",
//     icon: "settings",
//     steps: [{ type: "ui", action: "open-theme-settings" }],
//   },
```

- [ ] **Step 3: Remove `open-theme-settings` from terminal-command-pipeline.ts**

In `grove/src/lib/terminal-command-pipeline.ts`:

Remove from `TerminalCommandIcon` type:
```ts
// Remove: | "settings"
```

Remove from `TerminalCommandStep` type:
```ts
// Remove: | { type: "ui"; action: "open-theme-settings" }
```

Remove from `TerminalCommandContext` interface:
```ts
// Remove: openThemeSettings: () => void;
```

Remove from `executeTerminalCommand` function body:
```ts
// Remove the entire case "ui" block:
//     case "ui":
//       if (step.action === "open-theme-settings") {
//         context.openThemeSettings();
//       }
//       break;
```

- [ ] **Step 4: Remove `openThemeSettings` from useTerminalCommandPipeline hook**

In `grove/src/hooks/useTerminalCommandPipeline.ts`:

Remove the `Options` interface and the parameter from the hook:

```ts
// Change:
// interface Options {
//   openThemeSettings: () => void;
// }
// export function useTerminalCommandPipeline({ openThemeSettings }: Options) {

// To:
export function useTerminalCommandPipeline() {
```

Remove `openThemeSettings` from the `context` useMemo and its deps array:

```ts
  const context = useMemo(
    () => ({
      activeWorktree,
      focusedPtyId,
      terminalCount,
      splitTerminal: splitCurrent,
      closeTerminal: closeCurrent,
      mirrorTerminal,
      sendText,
    }),
    [
      activeWorktree,
      closeCurrent,
      focusedPtyId,
      mirrorTerminal,
      terminalCount,
      sendText,
      splitCurrent,
    ],
  );
```

- [ ] **Step 5: Update test file**

In `grove/src/lib/terminal-command-pipeline.test.ts`:

Remove `openThemeSettings` from the `makeContext` helper:

```ts
function makeContext(
  overrides: Partial<TerminalCommandContext> = {},
): TerminalCommandContext {
  return {
    activeWorktree: "/tmp/worktree",
    focusedPtyId: "pty-1",
    terminalCount: 2,
    splitTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    mirrorTerminal: vi.fn(),
    sendText: vi.fn(),
    ...overrides,
  };
}
```

Remove the "opens theme settings through a ui step" test (lines 72-85).

- [ ] **Step 6: Delete ThemeSettings.tsx**

```bash
rm grove/src/components/terminal/ThemeSettings.tsx
```

- [ ] **Step 7: Run lint and tests**

Run: `cd grove && pnpm lint && pnpm test`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add -A grove/src/components/terminal/ grove/src/lib/terminal-command-registry.ts grove/src/lib/terminal-command-pipeline.ts grove/src/lib/terminal-command-pipeline.test.ts grove/src/hooks/useTerminalCommandPipeline.ts
git commit -m "refactor(grove): remove ThemeSettings slide panel and terminal-settings command"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full lint and test suite**

Run: `cd grove && pnpm lint && pnpm test`
Expected: All PASS with no errors

- [ ] **Step 2: Manual smoke test**

Run: `cd grove && pnpm tauri dev`

Verify:
1. Gear icon visible in AppTabBar, right of the + tab button
2. Clicking gear opens Preferences modal with General/Terminal tabs
3. General tab: Preferred IDE dropdown works, persists on selection
4. Terminal tab: Link Open Mode dropdown works with descriptive labels, persists
5. Terminal tab: Appearance section shows presets, font, colors, preview — Apply/Reset work
6. Old ThemeSettings icon is gone from terminal toolbar
7. Close modal with X button or click outside

- [ ] **Step 3: Commit any fixes if needed**
