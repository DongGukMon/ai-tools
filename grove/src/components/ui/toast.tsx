import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, Info } from "lucide-react";
import { cn } from "../../lib/cn";
import { useToastStore, type ToastItem } from "../../store/toast";

const variantConfig = {
  success: {
    icon: CheckCircle2,
    bg: "bg-[#f0fdf4]",
    border: "border-[#bbf7d0]",
    iconColor: "text-[#22c55e]",
    textColor: "text-[#15803d]",
  },
  error: {
    icon: XCircle,
    bg: "bg-[#fef2f2]",
    border: "border-[#fecaca]",
    iconColor: "text-[#ef4444]",
    textColor: "text-[#b91c1c]",
  },
  info: {
    icon: Info,
    bg: "bg-[#eff6ff]",
    border: "border-[#bfdbfe]",
    iconColor: "text-[#3b82f6]",
    textColor: "text-[#1d4ed8]",
  },
  warning: {
    icon: AlertCircle,
    bg: "bg-[#fffbeb]",
    border: "border-[#fde68a]",
    iconColor: "text-[#f59e0b]",
    textColor: "text-[#92400e]",
  },
} as const;

function ToastCard({ toast }: { toast: ToastItem }) {
  const [exiting, setExiting] = useState(false);
  const config = variantConfig[toast.variant];
  const Icon = config.icon;

  useEffect(() => {
    const fadeTimer = setTimeout(() => setExiting(true), 2600);
    return () => clearTimeout(fadeTimer);
  }, []);

  return (
    <div
      className={cn(
        "flex items-start gap-2 w-[300px] px-3 py-2.5 rounded-lg border shadow-sm",
        config.bg,
        config.border,
        {
          "animate-toast-out": exiting,
          "animate-toast-in": !exiting,
        },
      )}
    >
      <Icon size={15} strokeWidth={2.5} className={cn("shrink-0 mt-px", config.iconColor)} />
      <span
        className={cn(
          "text-[12.5px] leading-[1.4] font-medium line-clamp-2",
          config.textColor,
        )}
      >
        {toast.message}
      </span>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className={cn("fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none")}>
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}
