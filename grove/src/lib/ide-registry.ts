import type { IdeMenuItem } from "../types";
import webstormIcon from "../assets/ide-icons/webstorm.svg";
import vscodeIcon from "../assets/ide-icons/vscode.png";
import xcodeIcon from "../assets/ide-icons/xcode.png";
import androidStudioIcon from "../assets/ide-icons/android-studio.svg";
import intellijIcon from "../assets/ide-icons/intellij.svg";
import cursorIcon from "../assets/ide-icons/cursor.png";
import sublimeIcon from "../assets/ide-icons/sublime.png";

export interface IdeRegistryEntry {
  id: IdeMenuItem["id"];
  displayName: string;
  iconSrc: string;
}

export const IDE_REGISTRY: readonly IdeRegistryEntry[] = [
  { id: "webstorm", displayName: "WebStorm", iconSrc: webstormIcon },
  { id: "vscode", displayName: "Visual Studio Code", iconSrc: vscodeIcon },
  { id: "xcode", displayName: "Xcode", iconSrc: xcodeIcon },
  {
    id: "android-studio",
    displayName: "Android Studio",
    iconSrc: androidStudioIcon,
  },
  { id: "intellij", displayName: "IntelliJ IDEA", iconSrc: intellijIcon },
  { id: "cursor", displayName: "Cursor", iconSrc: cursorIcon },
  { id: "sublime", displayName: "Sublime Text", iconSrc: sublimeIcon },
];

export function getIdeRegistryEntry(id: string): IdeRegistryEntry | undefined {
  return IDE_REGISTRY.find((entry) => entry.id === id);
}

export function buildIdeMenuItem(id: IdeMenuItem["id"]): IdeMenuItem | null {
  const entry = getIdeRegistryEntry(id);
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    displayName: entry.displayName,
  };
}

export function getIdeMenuItemDisplayName(item: IdeMenuItem): string {
  return item.displayName ?? getIdeRegistryEntry(item.id)?.displayName ?? item.id;
}
