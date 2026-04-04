# Grove Configs and Preferences

**Date**: 2026-04-04

## Summary

Grove stores app-wide configuration in `~/.grove/config.json`.

`config.json` currently carries three kinds of values:

- `baseDir` — storage root for project source clones and worktrees
- `terminalTheme` — saved terminal theme override
- `preferences` — Grove-specific behavior preferences

`preferences` is the home for user-selectable Grove behavior such as link opening policy, project list view mode, and preferred IDE. It is nested under `AppConfig`, but it is intentionally narrower in scope than the full app config.

The preferences layer provides persistence, I/O, and a Zustand store (`usePreferencesStore`). Terminal link routing is wired via `terminalLinkOpenMode` (see [Terminal Link Open](open-link.md)). Grove now exposes persisted preferences in the Preferences modal under General and Terminal tabs, including project grouping mode for the Projects sidebar. The Developer tab in that modal is diagnostic-only and does not persist to `config.json`. IDE launching has not been wired yet.

## Storage Model

### Config file path

Grove always reads and writes app config at:

```text
~/.grove/config.json
```

This path is fixed by `config_path()` in `grove-core/src/config.rs`.

### `baseDir` vs `config.json`

`baseDir` is not the path to `config.json`.

- `config.json` stays under `~/.grove/`
- `baseDir` controls where Grove stores project source clones and worktrees

Example:

```json
{
  "baseDir": "/Volumes/work/grove-data",
  "preferences": {
    "terminalLinkOpenMode": "external-with-localhost-internal",
    "projectViewMode": "default",
    "preferredIde": {
      "id": "webstorm"
    }
  }
}
```

With that config:

- the config file still lives at `~/.grove/config.json`
- source clones and worktrees are created under `/Volumes/work/grove-data`

## Type Model

### `AppConfig`

`AppConfig` is the full app-wide config envelope.

```ts
interface AppConfig {
  baseDir: string;
  terminalTheme?: Partial<TerminalTheme>;
  preferences: GrovePreferences;
}
```

### `GrovePreferences`

`GrovePreferences` stores user-selectable Grove behavior.

```ts
type TerminalLinkOpenMode =
  | "external"
  | "internal"
  | "external-with-localhost-internal";

type ProjectViewMode = "default" | "group-by-orgs";

interface PreferredIde {
  id: string;
  displayName?: string;
  openCommand?: string;
}

interface GrovePreferences {
  terminalLinkOpenMode: TerminalLinkOpenMode;
  projectViewMode: ProjectViewMode;
  collapsedProjectOrgs: string[];
  projectOrgOrder: string[];
  preferredIde: PreferredIde | null;
}
```

The Rust and TypeScript wire format matches:

- enum values are kebab-case strings
- object fields are camelCase

## Defaults

If `preferences` is missing from `config.json`, Grove falls back to `GrovePreferences::default()`.

Current defaults:

- `terminalLinkOpenMode = "external-with-localhost-internal"`
- `projectViewMode = "default"`
- `collapsedProjectOrgs = []`
- `projectOrgOrder = []`
- `preferredIde = { "id": "webstorm" }`

This defaulting is applied when older config files are loaded and do not yet contain a `preferences` block.

## JSON Shape

Minimal persisted shape with current defaults:

```json
{
  "baseDir": "/Users/you/.grove",
  "preferences": {
    "terminalLinkOpenMode": "external-with-localhost-internal",
    "projectViewMode": "default",
    "preferredIde": {
      "id": "webstorm"
    }
  }
}
```

Full shape with optional IDE metadata:

```json
{
  "baseDir": "/Users/you/.grove",
  "terminalTheme": {
    "background": "#000000",
    "foreground": "#ffffff"
  },
  "preferences": {
    "terminalLinkOpenMode": "internal",
    "projectViewMode": "group-by-orgs",
    "collapsedProjectOrgs": ["sendbird"],
    "projectOrgOrder": ["bang9", "sendbird"],
    "preferredIde": {
      "id": "cursor",
      "displayName": "Cursor",
      "openCommand": "cursor"
    }
  }
}
```

`preferredIde` may also be `null`.

`collapsedProjectOrgs` is omitted from `config.json` when it is empty.
`projectOrgOrder` is omitted from `config.json` when it is empty.

## I/O Interfaces

### Rust core

`grove-core/src/config.rs` exposes two layers:

- full config
  - `load_app_config()`
  - `save_app_config(...)`
  - `get_app_config_impl()`
- preference-only
  - `load_grove_preferences()`
  - `save_grove_preferences(...)`
  - `get_grove_preferences_impl()`

`save_grove_preferences(...)` updates only `preferences` and preserves existing `projects`, `baseDir`, and `terminalTheme`.

### Tauri commands

`src-tauri/src/lib.rs` exposes:

- `get_app_config`
- `save_app_config`
- `get_grove_preferences`
- `save_grove_preferences`

### Electron bridge

Electron exposes the same command surface through:

- `src-electron/native/src/lib.rs`
- `src-electron/main.ts`

The Electron main process treats `get_grove_preferences` as a JSON-returning command and serializes `save_grove_preferences` arguments before calling the native addon.

### Frontend wrappers

`src/lib/platform/{tauri,electron}.ts` exports:

- `getAppConfig()`
- `saveAppConfig(config)`
- `getGrovePreferences()`
- `saveGrovePreferences(preferences)`

Use `get/saveGrovePreferences()` when only behavior preferences are needed. Use `get/saveAppConfig()` when a caller needs to read or update the full app config envelope.

## Effective vs Persisted Config

`getAppConfig()` returns an effective app config, not a byte-for-byte mirror of `config.json`.

In particular:

- `baseDir` is defaulted to `~/.grove` when absent
- `preferences` is defaulted to `GrovePreferences::default()` when absent
- `terminalTheme` falls back to detected Terminal.app theme when no saved override exists

`getGrovePreferences()` returns the persisted-or-defaulted preference view only.

## Current Implementation Status

Persisted and exposed:

- terminal link open policy
- project view mode selection (`default`, `group-by-orgs`)
- preferred IDE selection
- Preferences UI for persisted General and Terminal settings

Not implemented yet:

- project/worktree `Open in IDE` action using `preferredIde`

## Relevant Files

| File | Role |
|------|------|
| `grove-core/src/config.rs` | Config schema, defaults, persistence, legacy loading |
| `grove-core/src/lib.rs` | Re-export of config-facing types |
| `src/types/index.ts` | Frontend type definitions |
| `src-tauri/src/lib.rs` | Tauri command surface |
| `src-electron/native/src/lib.rs` | Electron native command surface |
| `src-electron/main.ts` | Electron IPC JSON routing |
| `src/lib/platform/tauri.ts` | Tauri frontend wrappers |
| `src/lib/platform/electron.ts` | Electron frontend wrappers |
| `src/store/preferences.ts` | Zustand store with init/save |
| `src/lib/url-open.ts` | Runtime consumer of `terminalLinkOpenMode` |
