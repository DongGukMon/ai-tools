import { useCallback, useRef, useState } from "react";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseMarqueeResult {
  rect: Rect | null;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onClickCapture: (e: React.MouseEvent) => void;
  };
}

export function useMarqueeSelection(
  containerRef: React.RefObject<HTMLElement | null>,
  itemRefs: React.MutableRefObject<Map<string, HTMLElement>>,
  onSelectionChange: (selectedIds: Set<string>) => void,
): UseMarqueeResult {
  const [rect, setRect] = useState<Rect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(false);
  const suppressNextClickRef = useRef(false);

  const hitTest = useCallback(
    (marqueeRect: Rect) => {
      const selected = new Set<string>();
      const container = containerRef.current;
      if (!container) return selected;
      const containerBounds = container.getBoundingClientRect();

      for (const [id, el] of itemRefs.current) {
        const itemBounds = el.getBoundingClientRect();
        const itemRelY = itemBounds.top - containerBounds.top + container.scrollTop;
        const itemRelX = itemBounds.left - containerBounds.left;

        const intersects =
          marqueeRect.x < itemRelX + itemBounds.width &&
          marqueeRect.x + marqueeRect.width > itemRelX &&
          marqueeRect.y < itemRelY + itemBounds.height &&
          marqueeRect.y + marqueeRect.height > itemRelY;

        if (intersects) selected.add(id);
      }
      return selected;
    },
    [containerRef, itemRefs],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Start tracking from anywhere in the container (including file items)
      // Marquee only activates after dragging > 4px threshold
      e.preventDefault(); // Prevent browser text selection during drag
      suppressNextClickRef.current = false;
      const container = containerRef.current;
      if (!container) return;

      const containerBounds = container.getBoundingClientRect();
      const x = e.clientX - containerBounds.left;
      const y = e.clientY - containerBounds.top + container.scrollTop;
      startRef.current = { x, y };
      activeRef.current = false;
      setRect(null);
    },
    [containerRef],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!startRef.current) return;
      const container = containerRef.current;
      if (!container) return;

      const containerBounds = container.getBoundingClientRect();
      const currentX = e.clientX - containerBounds.left;
      const currentY = e.clientY - containerBounds.top + container.scrollTop;

      const x = Math.min(startRef.current.x, currentX);
      const y = Math.min(startRef.current.y, currentY);
      const width = Math.abs(currentX - startRef.current.x);
      const height = Math.abs(currentY - startRef.current.y);

      if (!activeRef.current && (width > 4 || height > 4)) {
        activeRef.current = true;
      }

      if (activeRef.current) {
        const newRect = { x, y, width, height };
        setRect(newRect);
        onSelectionChange(hitTest(newRect));
      }
    },
    [containerRef, hitTest, onSelectionChange],
  );

  const onMouseUp = useCallback(() => {
    const wasActive = activeRef.current;
    startRef.current = null;
    activeRef.current = false;
    setRect(null);
    suppressNextClickRef.current = wasActive;
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!suppressNextClickRef.current) return;
    suppressNextClickRef.current = false;
    // Use React's capture phase so the synthetic FileItem click never runs after a drag.
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    rect,
    handlers: { onMouseDown, onMouseMove, onMouseUp, onClickCapture },
  };
}
