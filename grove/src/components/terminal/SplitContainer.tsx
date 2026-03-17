import type { SplitNode } from "../../types";
import TerminalInstance from "./TerminalInstance";
import { useTerminalStore } from "../../store/terminal";
import { cn } from "../../lib/cn";
import ResizablePanelGroup from "../ui/resizable-panel-group";

interface Props {
  node: SplitNode;
  worktreePath: string;
  path?: number[];
}

export default function SplitContainer({
  node,
  worktreePath,
  path = [],
}: Props) {
  const updateSizes = useTerminalStore((s) => s.updateSizes);

  if (node.type === "leaf") {
    return node.ptyId ? (
      <div className={cn("relative w-full h-full")}>
        <TerminalInstance paneId={node.id} ptyId={node.ptyId} />
      </div>
    ) : null;
  }

  return (
    <ResizablePanelGroup
      className={cn("h-full w-full")}
      id={node.id}
      vertical={node.type === "vertical"}
      ratios={node.sizes}
      onCommit={(ratios) => {
        updateSizes(worktreePath, path, ratios);
      }}
    >
      {node.children?.map((child, i) => (
        <ResizablePanelGroup.Pane
          key={child.id}
          preferredSize={node.sizes?.[i] !== undefined ? `${node.sizes[i] * 100}%` : undefined}
        >
          <SplitContainer
            node={child}
            worktreePath={worktreePath}
            path={[...path, i]}
          />
        </ResizablePanelGroup.Pane>
      ))}
    </ResizablePanelGroup>
  );
}
