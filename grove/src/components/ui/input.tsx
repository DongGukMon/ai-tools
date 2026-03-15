import { forwardRef } from "react";
import { cn } from "../../lib/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full px-3 py-[7px] text-[13px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white text-[var(--color-text)] outline-none transition-all duration-150",
          "focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]",
          "placeholder:text-[var(--color-text-muted)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
