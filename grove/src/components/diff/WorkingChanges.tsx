import { cn } from "../../lib/cn";

interface Props {
  isSelected: boolean;
  onClick: () => void;
}

export default function WorkingChanges({ isSelected, onClick }: Props) {
  return (
    <div
      className={cn("px-4 py-2 cursor-pointer select-none transition-colors", {
        "bg-selected": isSelected,
        "hover:bg-secondary/30": !isSelected,
      })}
      onClick={onClick}
    >
      <span className="text-sm font-medium text-foreground">
        Working Changes
      </span>
    </div>
  );
}
