import type { ReactNode } from "react";
import { FolderOpen, Terminal } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { cn } from "../../lib/cn";
import { revealInFinder } from "../../lib/platform";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { runCommandSafely } from "../../lib/command";

interface SidebarContextMenuProps {
  /** Directory path used by common menu actions */
  path: string;
  /** The element that triggers the context menu on right-click */
  children: ReactNode;
  /** Additional menu items rendered above the common items (separator added automatically) */
  extraItems?: ReactNode;
}

function SidebarContextMenu({ path, children, extraItems }: SidebarContextMenuProps) {
  const handleRevealInFinder = () => {
    void runCommandSafely(() => revealInFinder(path));
  };

  const handleOpenInGlobalTerminal = () => {
    const dirName = path.split("/").pop() ?? "Terminal";
    usePanelLayoutStore.getState().addGlobalTerminalTab({
      title: dirName,
      cwd: path,
    });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {extraItems}
        {extraItems && <ContextMenuSeparator />}
        <ContextMenuItem onSelect={handleRevealInFinder}>
          <FolderOpen className={cn("mr-2 h-4 w-4")} />
          Open in Finder
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleOpenInGlobalTerminal}>
          <Terminal className={cn("mr-2 h-4 w-4")} />
          Open in Global Terminal
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default SidebarContextMenu;
