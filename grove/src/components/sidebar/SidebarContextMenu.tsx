import type { ReactNode } from "react";
import { FileText, FolderOpen, Terminal } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { Dialog } from "../ui/dialog";
import { cn } from "../../lib/cn";
import { openInIde, revealInFinder } from "../../lib/platform";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { usePreferencesStore } from "../../store/preferences";
import { runCommandSafely } from "../../lib/command";
import { overlay } from "../../lib/overlay";
import IdeAppIcon from "../ide/IdeAppIcon";
import {
  getIdeMenuItemDisplayName,
  getIdeRegistryEntry,
} from "../../lib/ide-registry";
import { NoteEditorContent } from "./NotePopover";

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
      overlay.open<void>(({ close }) => (
        <Dialog open onClose={close} title={noteLabel ?? "Note"} className="max-w-sm">
          <NoteEditorContent noteKey={noteKey} onClose={close} />
        </Dialog>
      ));
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
