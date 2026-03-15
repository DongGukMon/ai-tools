import type { FileStatus } from "../../types";

export type DiffFileStatus = FileStatus["status"];

interface StatusMeta {
  label: string;
  shortLabel: string;
  badgeVariant: "default" | "success" | "warning" | "danger";
  accentColor: string;
}

const STATUS_META: Record<DiffFileStatus, StatusMeta> = {
  modified: {
    label: "Modified",
    shortLabel: "M",
    badgeVariant: "warning",
    accentColor: "var(--color-warning)",
  },
  added: {
    label: "Added",
    shortLabel: "A",
    badgeVariant: "success",
    accentColor: "var(--color-success)",
  },
  deleted: {
    label: "Deleted",
    shortLabel: "D",
    badgeVariant: "danger",
    accentColor: "var(--color-danger)",
  },
  renamed: {
    label: "Renamed",
    shortLabel: "R",
    badgeVariant: "default",
    accentColor: "var(--color-info)",
  },
  untracked: {
    label: "Untracked",
    shortLabel: "U",
    badgeVariant: "success",
    accentColor: "var(--color-success)",
  },
};

export function getFileStatusMeta(status: DiffFileStatus): StatusMeta {
  return STATUS_META[status];
}

export function splitFilePath(path: string) {
  const parts = path.split("/");
  const fileName = parts.pop() ?? path;
  const directory = parts.length > 0 ? parts.join("/") : null;

  return { directory, fileName };
}
