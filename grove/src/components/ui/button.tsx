import { forwardRef } from "react";
import { cn } from "../../lib/cn";

const variantStyles = {
  default:
    "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-[var(--shadow-xs)]",
  secondary:
    "bg-[var(--color-bg-tertiary)] text-[var(--color-text)] hover:bg-[var(--color-border)]",
  ghost:
    "bg-transparent hover:bg-[var(--color-bg-tertiary)]",
  outline:
    "border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-bg-tertiary)]",
  destructive:
    "bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-hover)]",
} as const;

const sizeStyles = {
  sm: "h-7 px-2.5 text-[12px] gap-1",
  md: "h-8 px-3 text-[12px] gap-1.5",
  lg: "h-9 px-4 text-[13px] gap-2",
  icon: "h-7 w-7 p-0",
} as const;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-colors duration-100 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-[-2px]",
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
