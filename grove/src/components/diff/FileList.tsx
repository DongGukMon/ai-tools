import type { MouseEvent, ReactNode } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { FileStatus } from "../../types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/cn";
import { getFileStatusMeta, splitFilePath } from "./fileStatusMeta";

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
  const staged = fileStatuses.filter((file) => file.staged);
  const unstaged = fileStatuses.filter((file) => !file.staged);

  return (
    <div
      className={cn(
        "shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg)]",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-4 pb-2 pt-3 select-none",
        )}
      >
        <div>
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]",
            )}
          >
            Working Tree
          </p>
          <p
            className={cn(
              "mt-1 text-[13px] font-semibold text-[var(--color-text)]",
            )}
          >
            Files
          </p>
        </div>
        <Badge
          variant="secondary"
          className={cn(
            "rounded-full border border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] px-2 py-0 text-[10px] font-semibold text-[var(--color-text-secondary)]",
          )}
        >
          {fileStatuses.length}
        </Badge>
      </div>

      <div className={cn("max-h-[260px] overflow-y-auto px-3 pb-3")}>
        {staged.length > 0 && (
          <FileSection title="Staged" count={staged.length}>
            {staged.map((file) => (
              <FileItem
                key={`staged-${file.path}`}
                file={file}
                isSelected={selectedFile === file.path && isViewingStaged}
                onClick={() => onSelectFile(file.path, true)}
                actions={
                  <ActionButton
                    icon={<Minus size={12} strokeWidth={2.25} />}
                    title="Unstage"
                    variant="neutral"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onUnstageFile(file.path);
                    }}
                  />
                }
              />
            ))}
          </FileSection>
        )}

        {unstaged.length > 0 && (
          <FileSection title="Unstaged" count={unstaged.length}>
            {unstaged.map((file) => (
              <FileItem
                key={`unstaged-${file.path}`}
                file={file}
                isSelected={selectedFile === file.path && !isViewingStaged}
                onClick={() => onSelectFile(file.path, false)}
                actions={
                  <>
                    <ActionButton
                      icon={<Plus size={12} strokeWidth={2.25} />}
                      title="Stage"
                      variant="success"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onStageFile(file.path);
                      }}
                    />
                    <ActionButton
                      icon={<Trash2 size={11} strokeWidth={2} />}
                      title="Discard"
                      variant="danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onDiscardFile(file.path);
                      }}
                    />
                  </>
                }
              />
            ))}
          </FileSection>
        )}

        {fileStatuses.length === 0 && (
          <div
            className={cn(
              "rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-center shadow-xs",
            )}
          >
            <p className={cn("text-[12px] font-medium text-[var(--color-text)]")}>
              Working tree is clean
            </p>
            <p
              className={cn(
                "mt-1 text-[11px] leading-relaxed text-[var(--color-text-tertiary)]",
              )}
            >
              File-level stage, unstage, and discard controls appear here when
              the worktree has changes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function FileSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className={cn("pb-3 last:pb-0")}>
      <div className={cn("mb-2 flex items-center justify-between px-1 select-none")}>
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]",
          )}
        >
          {title}
        </p>
        <Badge
          variant="secondary"
          className={cn(
            "rounded-full border border-[var(--color-border-light)] bg-white px-2 py-0 text-[10px] font-semibold text-[var(--color-text-secondary)] shadow-xs",
          )}
        >
          {count}
        </Badge>
      </div>
      <div className={cn("space-y-1.5")}>{children}</div>
    </section>
  );
}

function ActionButton({
  icon,
  title,
  variant,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  variant: "success" | "neutral" | "danger";
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const variantClasses = {
    success:
      "text-[var(--color-primary)] hover:border-[var(--color-primary-border)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]",
    neutral:
      "text-[var(--color-text-secondary)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)]",
    danger:
      "text-[var(--color-danger)] hover:border-[var(--color-danger)]/15 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]",
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn(
        "size-7 rounded-lg border border-transparent bg-white/70 shadow-none transition-colors",
        variantClasses[variant],
      )}
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
  actions: ReactNode;
}) {
  const { accentColor, badgeVariant, label, shortLabel } = getFileStatusMeta(
    file.status,
  );
  const { directory, fileName } = splitFilePath(file.path);

  return (
    <div
      className={cn(
        "group flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[12px] shadow-xs transition-all duration-100 select-none",
        {
          "border-[var(--color-primary-border)] bg-white": isSelected,
          "border-transparent bg-transparent hover:border-[var(--color-border-light)] hover:bg-white/80":
            !isSelected,
        },
      )}
      onClick={onClick}
      title={file.path}
    >
      <Badge
        variant={badgeVariant}
        className={cn(
          "mt-0.5 min-w-6 justify-center rounded-full px-1.5 py-0 text-[10px] font-semibold shadow-none",
        )}
        style={{ color: accentColor }}
      >
        {shortLabel}
      </Badge>

      <div className={cn("min-w-0 flex-1")}>
        <div className={cn("flex items-center gap-2")}>
          <span
            className={cn("min-w-0 flex-1 truncate text-[var(--color-text)]", {
              "font-semibold": isSelected,
              "font-medium": !isSelected,
            })}
          >
            {fileName}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "rounded-full border-[var(--color-border-light)] bg-white px-2 py-0 text-[10px] font-medium text-[var(--color-text-secondary)] shadow-none",
            )}
          >
            {label}
          </Badge>
        </div>
        <p
          className={cn(
            "mt-1 truncate text-[11px] leading-relaxed text-[var(--color-text-secondary)]",
          )}
        >
          {directory ? `${directory}/` : "Repository root"}
        </p>
      </div>

      <div
        className={cn(
          "ml-auto flex shrink-0 items-center gap-1 transition-opacity duration-100",
          {
            "opacity-100": isSelected,
            "opacity-70 group-hover:opacity-100": !isSelected,
          },
        )}
      >
        {actions}
      </div>
    </div>
  );
}
