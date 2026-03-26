import { resizePty } from "./platform";
import { runCommandSafely } from "./command";
import type { BroadcastSession } from "../store/broadcast";

export function buildBroadcastSessionKey(
  ownerId: string,
  session: Pick<BroadcastSession, "ptyId" | "paneId">,
): string {
  return `${ownerId}:${session.ptyId}:${session.paneId}`;
}

export function restoreBroadcastSessionSize(
  session: Pick<BroadcastSession, "ptyId" | "originalCols" | "originalRows"> | null,
) {
  if (!session) {
    return;
  }

  void runCommandSafely(
    () => resizePty(session.ptyId, session.originalCols, session.originalRows),
    { errorToast: false },
  );
}
