import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface Props {
  icon: ReactNode;
  label: ReactNode;
  title: string;
  isSelected: boolean;
  disabled?: boolean;
  onActivate: () => void;
  status?: ReactNode;
  action?: ReactNode;
}

function SidebarLeafItem({
  icon,
  label,
  title,
  isSelected,
  disabled = false,
  onActivate,
  status,
  action,
}: Props) {
  return (
    <div
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-all duration-150 cursor-pointer select-none",
        {
          "pointer-events-none opacity-50": disabled,
          "bg-selected text-foreground": isSelected && !disabled,
          "text-muted-foreground hover:bg-secondary/50 hover:text-foreground":
            !isSelected && !disabled,
        },
      )}
      onClick={onActivate}
      title={title}
    >
      {icon}
      <span className={cn("min-w-0 flex-1 truncate")}>{label}</span>
      {status}
      {action}
    </div>
  );
}

export default SidebarLeafItem;
