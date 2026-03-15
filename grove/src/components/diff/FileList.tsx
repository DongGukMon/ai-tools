import { Plus, Minus, Trash2 } from "lucide-react";
import type { FileStatus } from "../../types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/cn";

interface Props {
  fileStatuses: FileStatus[];
  selectedFile: string | null;
  isViewingStaged: boolean;
  onSelectFile: (path: string | null, staged?: boolean) => void;
  onStageFile: (path: string) => Promise<void>;
  onUnstageFile: (path: string) => Promise<void>;
  onDiscardFile: (path: string) => Promise<void>;
}

export default function FileList({
  fileStatuses,
  selectedFile,
  isViewingStaged,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
}: Props) {
  const staged = fileStatuses.filter((f) => f.staged);
  const unstaged = fileStatuses.filter((f) => !f.staged);

  return (
    <div className={cn("border-b border-[var(--color-border)] shrink-0 max-h-[200px] overflow-y-auto")}>
      {/* Staged section */}
      {staged.length > 0 && (
        <div>
          <div className={cn("text-[11px] uppercase tracking-wider font-medium text-[var(--color-text-tertiary)] px-3 pt-2.5 pb-1 select-none")}>
            Staged ({staged.length})
          </div>
          {staged.map((file) => (
            <FileItem
              key={`staged-${file.path}`}
              file={file}
              isSelected={selectedFile === file.path && isViewingStaged}
              onClick={() => onSelectFile(file.path, true)}
              actions={
                <ActionButton
                  icon={<Minus size={12} strokeWidth={2} />}
                  title="Unstage"
                  variant="warning"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnstageFile(file.path);
                  }}
                />
              }
            />
          ))}
        </div>
      )}

      {/* Unstaged section */}
      {unstaged.length > 0 && (
        <div>
          <div className={cn("text-[11px] uppercase tracking-wider font-medium text-[var(--color-text-tertiary)] px-3 pt-2.5 pb-1 select-none")}>
            Unstaged ({unstaged.length})
          </div>
          {unstaged.map((file) => (
            <FileItem
              key={`unstaged-${file.path}`}
              file={file}
              isSelected={selectedFile === file.path && !isViewingStaged}
              onClick={() => onSelectFile(file.path, false)}
              actions={
                <>
                  <ActionButton
                    icon={<Plus size={12} strokeWidth={2} />}
                    title="Stage"
                    variant="success"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStageFile(file.path);
                    }}
                  />
                  <ActionButton
                    icon={<Trash2 size={11} strokeWidth={2} />}
                    title="Discard"
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDiscardFile(file.path);
                    }}
                  />
                </>
              }
            />
          ))}
        </div>
      )}

      {fileStatuses.length === 0 && (
        <div className={cn("py-4 text-[12px] text-[var(--color-text-tertiary)] text-center")}>
          No changes
        </div>
      )}
    </div>
  );
}

const statusBadgeVariant: Record<string, "success" | "warning" | "danger" | "default"> = {
  modified: "warning",
  added: "success",
  deleted: "danger",
  renamed: "default",
  untracked: "success",
};

const statusColors: Record<string, string> = {
  modified: "var(--color-warning)",
  added: "var(--color-success)",
  deleted: "var(--color-danger)",
  renamed: "var(--color-info)",
  untracked: "var(--color-success)",
};

function ActionButton({
  icon,
  title,
  variant,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  variant: "success" | "warning" | "danger";
  onClick: (e: React.MouseEvent) => void;
}) {
  const variantClasses = {
    success: "hover:text-[var(--color-success)] hover:bg-[var(--color-success-bg)]",
    warning: "hover:text-[var(--color-warning)] hover:bg-[#fffbeb]",
    danger: "hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]",
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("w-[20px] h-[20px] rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)]", variantClasses[variant])}
      title={title}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}

function FileItem({
  file,
  isSelected,
  onClick,
  actions,
}: {
  file: FileStatus;
  isSelected: boolean;
  onClick: () => void;
  actions: React.ReactNode;
}) {
  const statusColor = statusColors[file.status] ?? "var(--color-text-tertiary)";
  const statusChar = file.status[0].toUpperCase();
  const fileName = file.path.split("/").pop() ?? file.path;
  const dirPath = file.path.includes("/")
    ? file.path.substring(0, file.path.lastIndexOf("/"))
    : "";
  const _badgeVariant = statusBadgeVariant[file.status] ?? "default";

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 px-3 h-[28px] cursor-pointer text-[12px] select-none overflow-hidden transition-colors duration-100",
        {
          "bg-[var(--color-primary-light)] border-l-[3px] border-l-[var(--color-primary)]":
            isSelected,
          "hover:bg-[var(--color-bg-tertiary)] border-l-[3px] border-l-transparent":
            !isSelected,
        },
      )}
      onClick={onClick}
    >
      <Badge
        variant={_badgeVariant}
        className={cn("font-mono font-semibold text-[11px] w-3.5 px-0 py-0 text-center justify-center bg-transparent")}
        style={{ color: statusColor }}
      >
        {statusChar}
      </Badge>
      <span
        className={cn("min-w-0 truncate text-[var(--color-text)]", {
          "font-medium": isSelected,
        })}
      >
        {fileName}
      </span>
      {dirPath && (
        <span className={cn("min-w-0 text-[11px] truncate flex-1 text-[var(--color-text-tertiary)]")}>
          {dirPath}/
        </span>
      )}
      <span className={cn("flex gap-0.5 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100")}>
        {actions}
      </span>
    </div>
  );
}
