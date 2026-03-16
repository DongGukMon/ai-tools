import type { SplitNode } from "../types";
import type {
  SaveTerminalSessionSnapshotRequest,
  TerminalPaneSnapshot,
  TerminalRestoreCwdSource,
  TerminalSessionSnapshot,
} from "./tauri";

export interface TerminalPaneEntry {
  paneId: string;
  ptyId?: string;
}

export interface TerminalRestorePlanEntry {
  paneId: string;
  launchCwd: string;
  lastKnownCwd: string | null;
  restoreCwd: string;
  restoreCwdSource: TerminalRestoreCwdSource | "fallback";
  scrollback: string;
  scrollbackTruncated: boolean;
}

function findPaneSnapshot(
  snapshot: TerminalSessionSnapshot | null,
  paneId: string,
): TerminalPaneSnapshot | undefined {
  return snapshot?.panes.find((pane) => pane.paneId === paneId);
}

export function collectTerminalPanes(node: SplitNode): TerminalPaneEntry[] {
  if (node.type === "leaf") {
    return [{ paneId: node.id, ptyId: node.ptyId }];
  }

  return (node.children ?? []).flatMap(collectTerminalPanes);
}

export function restoreLayoutWithPtyIds(
  node: SplitNode,
  panePtyIds: ReadonlyMap<string, string>,
): SplitNode {
  if (node.type === "leaf") {
    return {
      id: node.id,
      type: "leaf",
      ptyId: panePtyIds.get(node.id),
    };
  }

  return {
    id: node.id,
    type: node.type,
    sizes: node.sizes,
    children: (node.children ?? []).map((child) =>
      restoreLayoutWithPtyIds(child, panePtyIds),
    ),
  };
}

export function buildTerminalRestorePlan(
  layout: SplitNode,
  snapshot: TerminalSessionSnapshot | null,
  defaultCwd: string,
): TerminalRestorePlanEntry[] {
  return collectTerminalPanes(layout).map(({ paneId }) => {
    const paneSnapshot = findPaneSnapshot(snapshot, paneId);
    const restoreCwd = paneSnapshot?.restoreCwd.trim() || defaultCwd;
    const launchCwd = paneSnapshot?.launchCwd.trim() || restoreCwd;

    return {
      paneId,
      launchCwd,
      lastKnownCwd: paneSnapshot?.lastKnownCwd ?? null,
      restoreCwd,
      restoreCwdSource: paneSnapshot?.restoreCwdSource ?? "fallback",
      scrollback: paneSnapshot?.scrollback ?? "",
      scrollbackTruncated: paneSnapshot?.scrollbackTruncated ?? false,
    };
  });
}

export function buildTerminalSnapshotRequest(
  worktreePath: string,
  node: SplitNode | undefined,
  paneLaunchCwds?: ReadonlyMap<string, string>,
): SaveTerminalSessionSnapshotRequest {
  return {
    worktreePath,
    panes: node
      ? collectTerminalPanes(node).map(({ paneId, ptyId }) => ({
          paneId,
          ptyId,
          launchCwd: paneLaunchCwds?.get(paneId),
        }))
      : [],
  };
}

export function findWorktreePathForPtyId(
  sessions: Record<string, SplitNode>,
  ptyId: string,
): string | null {
  for (const [worktreePath, node] of Object.entries(sessions)) {
    if (collectTerminalPanes(node).some((pane) => pane.ptyId === ptyId)) {
      return worktreePath;
    }
  }

  return null;
}
