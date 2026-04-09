import type { ReactNode } from "react";
import { FileText, FolderOpen, Terminal } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { cn } from "../../lib/cn";
import { openInIde, revealInFinder } from "../../lib/platform";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { usePreferencesStore } from "../../store/preferences";
import { runCommandSafely } from "../../lib/command";
import IdeAppIcon from "../ide/IdeAppIcon";
import {
  getIdeMenuItemDisplayName,
  getIdeRegistryEntry,
} from "../../lib/ide-registry";
import { openNoteDialog } from "./NotePopover";

interface SidebarContextMenuProps {
  path: string;
  children: ReactNode;
  extraItems?: ReactNode;
  noteKey?: string;
  noteLabel?: string;
}

function SidebarContextMenu({ path, children, extraItems, noteKey, noteLabel }: SidebarContextMenuProps) {
  const ideMenuItems = usePreferencesStore((s) => s.ideMenuItems);

  const handleRevealInFinder = () => {
    void runCommandSafely(() => revealInFinder(path));
  };

  const handleOpenInIde = (id: string) => {
    const item = ideMenuItems.find((candidate) => candidate.id === id);
    if (!item) {
      return;
    }

    void runCommandSafely(() => openInIde(path, item));
  };

  const handleOpenInGlobalTerminal = () => {
    const dirName = path.split("/").pop() ?? "Terminal";
    usePanelLayoutStore.getState().addGlobalTerminalTab({
      title: dirName,
      cwd: path,
    });
  };

  const handleOpenNote = () => {
    if (noteKey) {
      openNoteDialog(noteKey, noteLabel ?? "Note");
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className={cn("min-w-[15rem]")}>
        {extraItems}
        {extraItems && <ContextMenuSeparator />}
        <ContextMenuItem onSelect={handleRevealInFinder}>
          <FolderOpen className={cn("mr-1.5 h-3.5 w-3.5")} />
          Open in Finder
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleOpenInGlobalTerminal}>
          <Terminal className={cn("mr-1.5 h-3.5 w-3.5")} />
          Open in Global Terminal
        </ContextMenuItem>
        {ideMenuItems.length > 0 && <ContextMenuSeparator />}
        {ideMenuItems.map((item) => {
          const entry = getIdeRegistryEntry(item.id);
          const label = getIdeMenuItemDisplayName(item);

          return (
            <ContextMenuItem key={item.id} onSelect={() => handleOpenInIde(item.id)}>
              <IdeAppIcon
                iconSrc={entry?.iconSrc}
                label={label}
                className={cn("mr-1.5 size-3.5 rounded-[4px]")}
              />
              {`Open in ${label}`}
            </ContextMenuItem>
          );
        })}
        {noteKey && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={handleOpenNote}>
              <FileText className={cn("mr-1.5 h-3.5 w-3.5")} />
              Note
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default SidebarContextMenu;
