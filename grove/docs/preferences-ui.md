# Preferences UI

Unified settings modal accessed via gear icon in AppTabBar. Two tabs: General, Terminal.

## Heading Hierarchy

All preference components must follow this heading hierarchy for visual and semantic consistency.

| Level | Tag | Class | Usage |
|-------|-----|-------|-------|
| Page title | `<h3>` | `text-sm font-semibold text-foreground` | Tab name — "General", "Terminal" |
| Section | `<h4>` | `text-[12px] font-medium text-foreground` | Setting group — "Preferred IDE", "Link Open Mode", "Appearance" |
| Sub-section | `<h5>` | `text-[11px] font-medium text-muted-foreground uppercase tracking-wider` | Within a section — "Presets", "Font", "Colors", "Preview" |
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
├── GeneralTab.tsx            # General tab: Preferred IDE
├── TerminalTab.tsx           # Terminal tab: Link Open Mode + Appearance
└── TerminalAppearance.tsx    # Appearance section: theme presets, font, colors, preview
```

## Data Flow

Settings auto-persist on change — no save button needed for preferences.

```
User interaction → Zustand store setter → Platform layer → Tauri command → config.json
```

- Preferences (IDE, link mode): `usePreferencesStore` → `saveGrovePreferences()`
- Terminal theme: `useTerminalStore` → `saveAppConfig()` (requires explicit Apply button)
