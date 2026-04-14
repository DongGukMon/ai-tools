import { Code2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

interface IdeAppIconProps {
  iconSrc?: string;
  label: string;
  className?: string;
  fallbackIcon?: LucideIcon;
}

export default function IdeAppIcon({
  iconSrc,
  label,
  className,
  fallbackIcon: FallbackIcon = Code2,
}: IdeAppIconProps) {
  if (iconSrc) {
    return (
      <img
        src={iconSrc}
        alt=""
        aria-hidden
        className={cn("shrink-0 rounded-[6px] object-cover", className)}
      />
    );
  }

  return (
    <div
      aria-hidden
      title={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[6px] bg-secondary text-muted-foreground",
        className,
      )}
    >
      <FallbackIcon className={cn("size-[70%]")} />
    </div>
  );
}
