import { useCallback, useRef } from "react";
import { Allotment } from "allotment";
import type { SplitNode } from "../../types";
import TerminalInstance from "./TerminalInstance";
import { useTerminalStore } from "../../store/terminal";

interface Props {
  node: SplitNode;
  path?: number[];
}

function getNodeKey(node: SplitNode): string {
  if (node.type === "leaf") return node.ptyId ?? "empty";
  return (node.children ?? []).map(getNodeKey).join("-");
}

export default function SplitContainer({ node, path = [] }: Props) {
  const activeWorktree = useTerminalStore((s) => s.activeWorktree);
  const updateSizes = useTerminalStore((s) => s.updateSizes);
  const isDragging = useRef(false);

  const handleDragStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleChange = useCallback(
    (sizes: number[]) => {
      // Only save when user is actually dragging (not during initial layout)
      if (!isDragging.current) return;
      if (activeWorktree && sizes.length > 0) {
        updateSizes(activeWorktree, path, sizes);
      }
    },
    [activeWorktree, path, updateSizes],
  );

  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  if (node.type === "leaf") {
    return node.ptyId ? (
      <div className="relative w-full h-full">
        <TerminalInstance ptyId={node.ptyId} />
      </div>
    ) : null;
  }

  return (
    <Allotment
      vertical={node.type === "vertical"}
      defaultSizes={node.sizes?.map((r) => r * 1000)}
      onDragStart={handleDragStart}
      onChange={handleChange}
      onDragEnd={handleDragEnd}
    >
      {node.children?.map((child, i) => (
        <Allotment.Pane key={getNodeKey(child)}>
          <SplitContainer node={child} path={[...path, i]} />
        </Allotment.Pane>
      ))}
    </Allotment>
  );
}
