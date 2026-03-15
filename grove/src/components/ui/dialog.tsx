import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  className?: string;
  children: React.ReactNode;
}

function Dialog({ open, onClose, title, className, children }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px] animate-[fade-in_150ms_ease-out]")}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={cn(
          "relative bg-[var(--color-bg)] rounded-[var(--radius-xl)] shadow-[var(--shadow-md)] border border-[var(--color-border)] w-full max-w-md mx-4 animate-[scale-in_150ms_ease-out]",
          className,
        )}
      >
        {(title || true) && (
          <div className={cn("flex items-center justify-between px-5 pt-4 pb-2")}>
            {title && (
              <h2 className={cn("text-[14px] font-semibold text-[var(--color-text)]")}>
                {title}
              </h2>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn("ml-auto h-6 w-6 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]")}
              onClick={onClose}
            >
              <X size={14} strokeWidth={2} />
            </Button>
          </div>
        )}
        <div className={cn("px-5 pb-5")}>{children}</div>
      </div>
    </div>
  );
}

export { Dialog };
