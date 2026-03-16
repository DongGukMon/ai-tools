import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useToastStore, type ToastItem } from "../../store/toast";
import { Button } from "./button";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => {
  return (
    <ToastPrimitives.Viewport
      ref={ref}
      className={cn(
        "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:right-0 sm:bottom-0 sm:top-auto sm:flex-col md:max-w-[420px]",
        className,
      )}
      {...props}
    />
  );
});

ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-4 py-3 shadow-lg transition-all",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        destructive: "border-destructive/15 bg-card text-card-foreground",
        success: "border-success/15 bg-card text-card-foreground",
        warning: "border-warning/15 bg-card text-card-foreground",
        info: "border-border bg-card text-card-foreground",
        error: "border-destructive/15 bg-card text-card-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});

Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => {
  return (
    <ToastPrimitives.Action
      ref={ref}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => {
  return (
    <ToastPrimitives.Close
      ref={ref}
      className={cn(
        "absolute top-2 right-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none group-hover:opacity-100",
        className,
      )}
      toast-close=""
      {...props}
    >
      <X className={cn("size-4")} />
    </ToastPrimitives.Close>
  );
});

ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => {
  return (
    <ToastPrimitives.Title
      ref={ref}
      className={cn("text-sm font-semibold", className)}
      {...props}
    />
  );
});

ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => {
  return (
    <ToastPrimitives.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});

ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;
type ToastActionElement = React.ReactElement<typeof ToastAction>;

const toastCardConfig: Record<
  ToastItem["variant"],
  {
    icon: typeof CheckCircle2;
    accentColor: string;
    iconBg: string;
    borderColor: string;
    glowShadow: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    accentColor: "oklch(0.72 0.19 145)",
    iconBg: "oklch(0.72 0.19 145 / 0.10)",
    borderColor: "oklch(0.72 0.19 145 / 0.15)",
    glowShadow: "0 0 24px oklch(0.72 0.19 145 / 0.06)",
  },
  error: {
    icon: XCircle,
    accentColor: "oklch(0.65 0.22 25)",
    iconBg: "oklch(0.65 0.22 25 / 0.10)",
    borderColor: "oklch(0.65 0.22 25 / 0.15)",
    glowShadow: "0 0 24px oklch(0.65 0.22 25 / 0.06)",
  },
  info: {
    icon: Info,
    accentColor: "oklch(0.7 0.15 240)",
    iconBg: "oklch(0.7 0.15 240 / 0.10)",
    borderColor: "oklch(0.7 0.15 240 / 0.15)",
    glowShadow: "0 0 24px oklch(0.7 0.15 240 / 0.06)",
  },
  warning: {
    icon: AlertCircle,
    accentColor: "oklch(0.8 0.16 80)",
    iconBg: "oklch(0.8 0.16 80 / 0.10)",
    borderColor: "oklch(0.8 0.16 80 / 0.15)",
    glowShadow: "0 0 24px oklch(0.8 0.16 80 / 0.06)",
  },
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const removeToast = useToastStore((state) => state.removeToast);
  const [exiting, setExiting] = React.useState(false);
  const [progressStarted, setProgressStarted] = React.useState(false);
  const config = toastCardConfig[toast.variant];
  const Icon = config.icon;

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setProgressStarted(true));
    const exitTimer = window.setTimeout(() => setExiting(true), 2600);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(exitTimer);
    };
  }, []);

  React.useEffect(() => {
    if (!exiting) return;
    const removeTimer = window.setTimeout(() => removeToast(toast.id), 300);
    return () => window.clearTimeout(removeTimer);
  }, [exiting, removeToast, toast.id]);

  return (
    <div
      className={cn(
        "group pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-lg py-3 pr-3 pl-4",
        {
          "animate-in fade-in-0 slide-in-from-right-full zoom-in-95 duration-300": !exiting,
          "animate-out fade-out-0 slide-out-to-right-full zoom-out-95 duration-200 fill-mode-forwards": exiting,
        },
      )}
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        border: `1px solid ${config.borderColor}`,
        boxShadow: `0 8px 32px oklch(0 0 0 / 0.45), 0 0 0 1px oklch(1 0 0 / 0.04), ${config.glowShadow}`,
      }}
    >
      {/* Left accent bar */}
      <div
        className={cn("absolute inset-y-0 left-0 w-[2.5px]")}
        style={{ backgroundColor: config.accentColor }}
      />

      {/* Icon */}
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
        )}
        style={{ backgroundColor: config.iconBg }}
      >
        <Icon
          className={cn("size-3.5")}
          style={{ color: config.accentColor }}
        />
      </div>

      {/* Message */}
      <p className={cn("min-w-0 flex-1 text-sm font-medium leading-snug text-foreground")}>
        {toast.message}
      </p>

      {/* Close button */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(
          "shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground group-hover:opacity-100",
        )}
        onClick={() => setExiting(true)}
      >
        <X className={cn("size-3.5")} />
        <span className={cn("sr-only")}>Dismiss</span>
      </Button>

      {/* Progress bar */}
      <div className={cn("absolute inset-x-0 bottom-0 h-[1.5px]")}>
        <div
          className={cn("h-full origin-left transition-transform ease-linear")}
          style={{
            backgroundColor: config.accentColor,
            opacity: 0.35,
            transform: progressStarted ? "scaleX(0)" : "scaleX(1)",
            transitionDuration: "2600ms",
          }}
        />
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2",
      )}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

export {
  type ToastActionElement,
  type ToastProps,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  toastVariants,
};
