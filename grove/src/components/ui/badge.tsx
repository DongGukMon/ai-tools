import { cn } from "../../lib/cn";

const variantStyles = {
  default:
    "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  secondary:
    "bg-[var(--color-border)] text-[var(--color-text-secondary)]",
  success:
    "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  warning:
    "bg-[#fffbeb] text-[var(--color-warning)]",
  danger:
    "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
} as const;

export interface BadgeProps {
  variant?: keyof typeof variantStyles;
  className?: string;
  children: React.ReactNode;
}

function Badge({ variant = "default", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[var(--radius-md)]",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export { Badge };
