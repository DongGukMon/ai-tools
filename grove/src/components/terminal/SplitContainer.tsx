import { useCallback, useRef, useEffect } from "react";
import { Allotment, type AllotmentHandle } from "allotment";
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
  const allotmentRef = useRef<AllotmentHandle>(null);
  const isDragging = useRef(false);

  // Restore saved sizes after mount via ref.resize()
  useEffect(() => {
    if (node.type !== "leaf" && node.sizes?.length) {
      const sizes = node.sizes.map((r) => r * 1000);
      // Wait for allotment to finish initial layout
      const timer = setTimeout(() => {
        allotmentRef.current?.resize(sizes);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, []); // only on mount

  const handleDragStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleChange = useCallback(
    (sizes: number[]) => {
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
      ref={allotmentRef}
      vertical={node.type === "vertical"}
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
