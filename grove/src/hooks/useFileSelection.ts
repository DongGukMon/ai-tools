import { useCallback, useRef, useState } from "react";

interface UseFileSelectionResult {
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  handleClick: (id: string, index: number, shiftKey: boolean) => void;
  handleMouseDown: (id: string, index: number) => void;
  handleMouseEnter: (id: string, index: number, buttons: number) => void;
  handleMouseUp: () => void;
  clearSelection: () => void;
}

export function useFileSelection<T>(
  items: T[],
  getId: (item: T) => string,
): UseFileSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIndexRef = useRef<number | null>(null);
  const dragStartIndexRef = useRef<number | null>(null);

  const selectRange = useCallback(
    (from: number, to: number) => {
      const min = Math.min(from, to);
      const max = Math.max(from, to);
      const next = new Set<string>();
      for (let i = min; i <= max && i < items.length; i++) {
        next.add(getId(items[i]));
      }
      setSelectedIds(next);
    },
    [items, getId],
  );

  const handleClick = useCallback(
    (id: string, index: number, shiftKey: boolean) => {
      if (shiftKey && lastClickedIndexRef.current !== null) {
        selectRange(lastClickedIndexRef.current, index);
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
      }
      lastClickedIndexRef.current = index;
    },
    [selectRange],
  );

  const handleMouseDown = useCallback((_id: string, index: number) => {
    dragStartIndexRef.current = index;
  }, []);

  const handleMouseEnter = useCallback(
    (_id: string, index: number, buttons: number) => {
      if (buttons === 1 && dragStartIndexRef.current !== null) {
        selectRange(dragStartIndexRef.current, index);
      }
    },
    [selectRange],
  );

  const handleMouseUp = useCallback(() => {
    dragStartIndexRef.current = null;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastClickedIndexRef.current = null;
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  return {
    selectedIds,
    isSelected,
    handleClick,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    clearSelection,
  };
}
