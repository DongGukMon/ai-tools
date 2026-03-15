import { useCallback, useRef } from "react";
import { Allotment } from "allotment";
import type { SplitNode } from "../../types";
import TerminalInstance from "./TerminalInstance";
import { useTerminalStore } from "../../store/terminal";

interface Props {
  node: SplitNode;
  /** Path from root to this node (array of child indices) */
  path?: number[];
}

function getNodeKey(node: SplitNode): string {
  if (node.type === "leaf") return node.ptyId ?? "empty";
  return (node.children ?? []).map(getNodeKey).join("-");
}

export default function SplitContainer({ node, path = [] }: Props) {
  const activeWorktree = useTerminalStore((s) => s.activeWorktree);
  const updateSizes = useTerminalStore((s) => s.updateSizes);
  // Skip initial onChange calls from allotment (fires during layout before user interaction)
  const mountTime = useRef(Date.now());

  const handleChange = useCallback(
    (sizes: number[]) => {
      // Ignore onChange during first 500ms (allotment initial layout)
      if (Date.now() - mountTime.current < 500) return;
      if (activeWorktree) {
        updateSizes(activeWorktree, path, sizes);
      }
    },
    [activeWorktree, path, updateSizes],
  );

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
      defaultSizes={node.sizes?.map((r) => r * 100)}
      onChange={handleChange}
    >
      {node.children?.map((child, i) => (
        <Allotment.Pane key={getNodeKey(child)}>
          <SplitContainer node={child} path={[...path, i]} />
        </Allotment.Pane>
      ))}
    </Allotment>
  );
}
