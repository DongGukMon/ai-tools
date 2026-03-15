import { useCallback, useRef } from "react";
import { Allotment } from "allotment";
import type { SplitNode } from "../../types";
import TerminalInstance from "./TerminalInstance";
import { useTerminalStore } from "../../store/terminal";
import { cn } from "../../lib/cn";


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
  const focusedPtyId = useTerminalStore((s) => s.focusedPtyId);
  const updateSizes = useTerminalStore((s) => s.updateSizes);
  const isDragging = useRef(false);
  const defaultSizes =
    node.type !== "leaf" && node.sizes?.length
      ? node.sizes.map((ratio) => ratio * 1000)
      : undefined;

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
      <div className={cn("h-full w-full min-h-0 min-w-0 p-1.5")}>
        <div
          className={cn(
            "relative h-full w-full overflow-hidden rounded-[22px] border border-white/75 bg-white/72 shadow-[var(--shadow-sm)] ring-1 ring-black/5 transition-[border-color,box-shadow]",
            {
              "border-[var(--color-primary-border)] shadow-[0_0_0_1px_var(--color-primary-border),var(--shadow-md)]":
                node.ptyId === focusedPtyId,
            },
          )}
        >
          <TerminalInstance ptyId={node.ptyId} />
        </div>
      </div>
    ) : null;
  }

  return (
    <Allotment
      className={cn(
        "h-full w-full [&_.split-view-view]:min-h-0 [&_.split-view-view]:min-w-0",
      )}
      vertical={node.type === "vertical"}
      defaultSizes={defaultSizes}
      onDragStart={handleDragStart}
      onChange={handleChange}
      onDragEnd={handleDragEnd}
    >
      {node.children?.map((child, i) => (
        <Allotment.Pane key={getNodeKey(child)}>
          <div className={cn("h-full w-full min-h-0 min-w-0")}>
            <SplitContainer node={child} path={[...path, i]} />
          </div>
        </Allotment.Pane>
      ))}
    </Allotment>
  );
}
