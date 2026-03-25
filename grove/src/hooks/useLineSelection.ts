import { useCallback, useRef } from "react";
import { useDiffStore } from "../store/diff";

export function useLineSelection() {
  const toggleLine = useDiffStore((s) => s.toggleLine);
  const selectLineRange = useDiffStore((s) => s.selectLineRange);
  const clearSelection = useDiffStore((s) => s.clearSelection);
  const lastClickedRef = useRef<number | null>(null);
  const dragStartRef = useRef<number | null>(null);

  const handleGutterClick = useCallback(
    (lineIndex: number, shiftKey: boolean) => {
      if (shiftKey && lastClickedRef.current !== null) {
        selectLineRange(lastClickedRef.current, lineIndex);
      } else {
        toggleLine(lineIndex);
      }
      lastClickedRef.current = lineIndex;
    },
    [toggleLine, selectLineRange],
  );

  const handleGutterMouseDown = useCallback(
    (lineIndex: number) => {
      dragStartRef.current = lineIndex;
    },
    [],
  );

  const handleGutterMouseEnter = useCallback(
    (lineIndex: number, buttons: number) => {
      if (buttons === 1 && dragStartRef.current !== null) {
        selectLineRange(dragStartRef.current, lineIndex);
      }
    },
    [selectLineRange],
  );

  const handleGutterMouseUp = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  return {
    handleGutterClick,
    handleGutterMouseDown,
    handleGutterMouseEnter,
    handleGutterMouseUp,
    clearSelection,
  };
}
