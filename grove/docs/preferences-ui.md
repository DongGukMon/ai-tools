# Preferences UI

Unified settings modal accessed via gear icon in AppTabBar. Three tabs: General, Terminal, Developer.

## Heading Hierarchy

All preference components must follow this heading hierarchy for visual and semantic consistency.

| Level | Tag | Class | Usage |
|-------|-----|-------|-------|
| Page title | `<h3>` | `text-sm font-semibold text-foreground` | Tab name — "General", "Terminal", "Developer" |
| Section | `<h4>` | `text-[12px] font-medium text-foreground` | Setting group — "Project view mode", "IDE menu items", "Link Open Mode", "Appearance" |
| Sub-section | `<h5>` | `text-[11px] font-medium text-muted-foreground uppercase tracking-wider` | Within a section — "Menu Preview", "Available IDEs", "Presets", "Font", "Colors", "Preview" |
| Field label | `<label>` | `text-[11px] text-muted-foreground` | Individual input label — "Font Family", "Font Size" |
| Description | `<p>` | `text-[11px] text-muted-foreground/70` | Helper text below a section heading |

Rules:
- Tags must descend semantically: `h3` > `h4` > `h5` > `label`. Never use `h3` inside `h4`.
- Sections with a description use `h4` + `p` + control. Sections without description use `h4` + control directly.
- Sub-sections are only used when a section contains multiple grouped settings (e.g., Appearance has Presets, Font, Colors).
- All `className` values use `cn()` per project convention.

## File Structure

```
src/components/preferences/
├── PreferencesModal.tsx      # Modal shell: Dialog + tab navigation
├── GeneralTab.tsx            # General tab: Project view mode + ordered IDE menu editor
├── TerminalTab.tsx           # Terminal tab: Link Open Mode + Appearance
├── DeveloperTab.tsx          # Developer tab: terminal GC diagnostics + manual reconcile
└── TerminalAppearance.tsx    # Appearance section: theme presets, font, colors, preview
```

## Data Flow

Settings auto-persist on change — no save button needed for preferences.

```
User interaction → Zustand store setter → Platform layer → Tauri command → config.json
```

- Preferences (project view mode, IDE, link mode): `usePreferencesStore` → `saveGrovePreferences()`
- Terminal theme: `useTerminalStore` → `saveAppConfig()` (requires explicit Apply button)
- Developer diagnostics: local component state → `run_terminal_gc` command → optional in-memory terminal store cleanup

## General Tab Notes

- `Project view mode` controls how the Projects sidebar is grouped.
- `IDE menu items` is an ordered list editor for sidebar context menus.
- The preview mirrors the runtime order: Finder, Global Terminal, then the selected IDE items.
- Reordering happens inside the preview list.
- Add and remove actions live in `Available IDEs`.
- Each IDE row shows the actual product icon from repo assets rather than a generic editor glyph.
