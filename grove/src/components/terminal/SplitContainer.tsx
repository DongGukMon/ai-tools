import { useCallback, useLayoutEffect, useRef } from "react";
import { Allotment, type AllotmentHandle } from "allotment";
import type { SplitNode } from "../../types";
import TerminalInstance from "./TerminalInstance";
import { useTerminalStore } from "../../store/terminal";
import { cn } from "../../lib/cn";


interface Props {
  node: SplitNode;
  path?: number[];
}

function toRatios(sizes: number[]): number[] {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return total > 0 ? sizes.map((size) => size / total) : sizes;
}

function serializeRatios(sizes: number[] | undefined): string {
  return sizes?.map((size) => size.toFixed(6)).join(":") ?? "";
}

function toAllotmentSizes(sizes: number[] | undefined): number[] | undefined {
  return sizes?.length ? sizes.map((ratio) => ratio * 1000) : undefined;
}

export default function SplitContainer({ node, path = [] }: Props) {
  const activeWorktree = useTerminalStore((s) => s.activeWorktree);
  const updateSizes = useTerminalStore((s) => s.updateSizes);
  const allotmentRef = useRef<AllotmentHandle | null>(null);
  const isDragging = useRef(false);
  const appliedSizesRef = useRef("");
  const resolvedSizes = node.type !== "leaf" ? toAllotmentSizes(node.sizes) : undefined;
  const ratioSignature = node.type !== "leaf" ? serializeRatios(node.sizes) : "";

  useLayoutEffect(() => {
    if (node.type === "leaf" || isDragging.current || !allotmentRef.current) return;
    if (!resolvedSizes || resolvedSizes.length === 0) return;
    if (appliedSizesRef.current === ratioSignature) return;

    allotmentRef.current.resize(resolvedSizes);
    appliedSizesRef.current = ratioSignature;
  }, [node.type, ratioSignature, resolvedSizes]);

  const handleDragStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleChange = useCallback(
    (sizes: number[]) => {
      if (!isDragging.current) return;
      if (activeWorktree && sizes.length > 0) {
        const ratios = toRatios(sizes);
        appliedSizesRef.current = serializeRatios(ratios);
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
      <div className={cn("relative w-full h-full")}>
        <TerminalInstance paneId={node.id} ptyId={node.ptyId} />
      </div>
    ) : null;
  }

  return (
    <Allotment
      ref={allotmentRef}
      id={node.id}
      vertical={node.type === "vertical"}
      defaultSizes={resolvedSizes}
      onDragStart={handleDragStart}
      onChange={handleChange}
      onDragEnd={handleDragEnd}
    >
      {node.children?.map((child, i) => (
        <Allotment.Pane
          key={child.id}
          preferredSize={node.sizes?.[i] !== undefined ? `${node.sizes[i] * 100}%` : undefined}
        >
          <SplitContainer node={child} path={[...path, i]} />
        </Allotment.Pane>
      ))}
    </Allotment>
  );
}
