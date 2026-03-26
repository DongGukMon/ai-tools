import { useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useTerminalStore } from "../../store/terminal";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { cn } from "../../lib/cn";

const MIN_WIDTH = 280;
const MAX_WIDTH = 960;
const ASPECT_RATIO = 9 / 16;

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  dismissed: boolean;
  onDismiss: () => void;
  onRestore: () => void;
  onClickHeader: () => void;
}

export default function PipTerminal({
  containerRef,
  dismissed,
  onDismiss,
  onRestore,
  onClickHeader,
}: Props) {
  const theme = useTerminalStore((s) => s.theme);
  const width = usePanelLayoutStore((s) => s.pipWidth);
  const updatePipWidth = usePanelLayoutStore((s) => s.updatePipWidth);
  const height = Math.round(width * ASPECT_RATIO);
  const resizing = useRef(false);
  const startRef = useRef({ x: 0, y: 0, w: 0 });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizing.current = true;
      startRef.current = { x: e.clientX, y: e.clientY, w: width };

      const onMove = (ev: MouseEvent) => {
        if (!resizing.current) return;
        const dx = startRef.current.x - ev.clientX;
        const dy = startRef.current.y - ev.clientY;
        const delta = Math.max(dx, dy);
        const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startRef.current.w + delta));
        updatePipWidth(next);
      };

      const onUp = () => {
        resizing.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, updatePipWidth],
  );

  return (
    <>
      {/* Resize handle — positioned outside PiP container */}
      {!dismissed && (
        <div
          className={cn("absolute z-[60] w-6 h-6")}
          style={{
            cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none'%3E%3Cpath d='M5 1H1v4M11 15h4v-4M1 1l14 14' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 8 8, auto`,
            right: `calc(${width}px + 12px - 12px)`,
            bottom: `calc(${height}px + 12px - 12px)`,
          }}
          onMouseDown={handleResizeStart}
        />
      )}

      {/* PiP window */}
      <div
        className={cn(
          "absolute right-3 bottom-3 z-50 rounded-xl overflow-clip",
          "shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-white/10",
          "flex flex-col transition-transform duration-300 ease-out",
          "translate-x-[calc(100%+16px)]",
          { "!translate-x-0": !dismissed },
        )}
        style={{ width, height }}
      >

        {/* Header */}
        <div
          className={cn(
            "flex items-center justify-between px-2.5 h-7 shrink-0 bg-sidebar/90 backdrop-blur-sm border-b border-white/10 select-none",
          )}
        >
          <span className={cn("text-xs font-medium text-muted-foreground truncate")}>
            Terminal
          </span>
          <div className={cn("flex items-center gap-0.5")}>
            <button
              type="button"
              onClick={onClickHeader}
              className={cn(
                "flex items-center justify-center size-5 rounded-sm cursor-pointer text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors",
              )}
              title="Open in Terminal tab"
            >
              <ExternalLink className={cn("size-3")} />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className={cn(
                "flex items-center justify-center size-5 rounded-sm cursor-pointer text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors",
              )}
              title="Hide"
            >
              <ChevronRight className={cn("size-3.5")} />
            </button>
          </div>
        </div>

        {/* Terminal container with horizontal padding */}
        <div
          className={cn("flex-1 min-h-0 px-2")}
          style={{ backgroundColor: theme?.background ?? "#000" }}
        >
          <div
            ref={containerRef}
            className={cn("h-full w-full")}
          />
        </div>
      </div>

      {/* Restore tab — visible when dismissed */}
      {dismissed && (
        <button
          type="button"
          onClick={onRestore}
          className={cn(
            "absolute right-0 bottom-6 z-50 flex items-center justify-center w-6 h-10 rounded-l-md",
            "bg-sidebar/90 border border-r-0 border-white/10 shadow-lg backdrop-blur-sm",
            "text-muted-foreground hover:text-foreground hover:bg-sidebar transition-colors",
          )}
          title="Show terminal"
        >
          <ChevronLeft className={cn("size-3.5")} />
        </button>
      )}
    </>
  );
}
