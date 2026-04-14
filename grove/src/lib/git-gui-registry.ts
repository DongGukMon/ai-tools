import type { GitGuiMenuItem } from "../types";
import forkIcon from "../assets/ide-icons/fork.png";
import sourcetreeIcon from "../assets/ide-icons/sourcetree.png";

export interface GitGuiRegistryEntry {
  id: GitGuiMenuItem["id"];
  displayName: string;
  iconSrc?: string;
}

export const GIT_GUI_REGISTRY: readonly GitGuiRegistryEntry[] = [
  { id: "sourcetree", displayName: "Sourcetree", iconSrc: sourcetreeIcon },
  { id: "fork", displayName: "Fork", iconSrc: forkIcon },
];

export function getGitGuiRegistryEntry(id: string): GitGuiRegistryEntry | undefined {
  return GIT_GUI_REGISTRY.find((entry) => entry.id === id);
}

export function buildGitGuiMenuItem(id: GitGuiMenuItem["id"]): GitGuiMenuItem | null {
  const entry = getGitGuiRegistryEntry(id);
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    displayName: entry.displayName,
  };
}

export function getGitGuiMenuItemDisplayName(item: GitGuiMenuItem): string {
  return item.displayName ?? getGitGuiRegistryEntry(item.id)?.displayName ?? item.id;
}
