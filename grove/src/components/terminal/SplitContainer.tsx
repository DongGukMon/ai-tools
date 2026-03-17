import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { Allotment, type AllotmentHandle } from "allotment";
import type { SplitNode } from "../../types";
import TerminalInstance from "./TerminalInstance";
import { useTerminalStore } from "../../store/terminal";
import { cn } from "../../lib/cn";


interface Props {
  node: SplitNode;
  worktreePath: string;
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

export default function SplitContainer({
  node,
  worktreePath,
  path = [],
}: Props) {
  const updateSizes = useTerminalStore((s) => s.updateSizes);
  const allotmentRef = useRef<AllotmentHandle | null>(null);
  const isDragging = useRef(false);
  const pendingSizesRef = useRef<number[] | null>(null);
  const resetPendingRef = useRef(false);
  const resetClearTimerRef = useRef<number | null>(null);
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

  const clearResetPending = useCallback(() => {
    if (resetClearTimerRef.current !== null) {
      window.clearTimeout(resetClearTimerRef.current);
      resetClearTimerRef.current = null;
    }
    resetPendingRef.current = false;
  }, []);

  useEffect(() => clearResetPending, [clearResetPending]);

  const handleDragStart = useCallback(() => {
    isDragging.current = true;
    pendingSizesRef.current = null;
    clearResetPending();
  }, [clearResetPending]);

  const handleSashDoubleClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-testid='sash']")) {
        return;
      }

      clearResetPending();
      resetPendingRef.current = true;
      resetClearTimerRef.current = window.setTimeout(() => {
        resetPendingRef.current = false;
        resetClearTimerRef.current = null;
      }, 0);
    },
    [clearResetPending],
  );

  const handleChange = useCallback(
    (sizes: number[]) => {
      if (sizes.length === 0) return;

      const ratios = toRatios(sizes);
      const signature = serializeRatios(ratios);
      if (signature === appliedSizesRef.current) {
        return;
      }

      if (isDragging.current) {
        appliedSizesRef.current = signature;
        pendingSizesRef.current = sizes.slice();
        return;
      }

      if (!resetPendingRef.current) {
        return;
      }

      clearResetPending();
      appliedSizesRef.current = signature;
      updateSizes(worktreePath, path, sizes);
    },
    [clearResetPending, path, updateSizes, worktreePath],
  );

  const handleDragEnd = useCallback((sizes: number[]) => {
    isDragging.current = false;
    const finalSizes = sizes.length > 0 ? sizes : pendingSizesRef.current;
    pendingSizesRef.current = null;
    if (finalSizes && finalSizes.length > 0) {
      appliedSizesRef.current = serializeRatios(toRatios(finalSizes));
      updateSizes(worktreePath, path, finalSizes);
    }
    clearResetPending();
  }, [clearResetPending, path, updateSizes, worktreePath]);

  if (node.type === "leaf") {
    return node.ptyId ? (
      <div className={cn("relative w-full h-full")}>
        <TerminalInstance paneId={node.id} ptyId={node.ptyId} />
      </div>
    ) : null;
  }

  return (
    <div
      className={cn("h-full w-full")}
      onDoubleClickCapture={handleSashDoubleClickCapture}
    >
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
            <SplitContainer
              node={child}
              worktreePath={worktreePath}
              path={[...path, i]}
            />
          </Allotment.Pane>
        ))}
      </Allotment>
    </div>
  );
}
