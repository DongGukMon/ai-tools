import { create } from "zustand";

export type BroadcastTarget = "mirror" | "pip";

export interface BroadcastSession {
  ptyId: string;
  paneId: string;
  target: BroadcastTarget;
  originalCols: number;
  originalRows: number;
  snapshot: string | null;
}

interface BroadcastState {
  mirrors: Record<string, BroadcastSession>;
  pips: Record<string, BroadcastSession>;

  /**
   * Start or replace a mirror broadcast for a specific PTY.
   */
  startMirror: (
    ptyId: string,
    paneId: string,
    originalCols: number,
    originalRows: number,
    snapshot?: string | null,
  ) => void;

  /**
   * Stop a mirror broadcast for a specific PTY.
   * Returns the ended session (for size restoration) or null if idle.
   */
  stopMirror: (ptyId: string) => BroadcastSession | null;

  /**
   * Start or replace the single PiP broadcast slot.
   */
  startPip: (
    worktreePath: string,
    ptyId: string,
    paneId: string,
    originalCols: number,
    originalRows: number,
    snapshot?: string | null,
  ) => void;

  /**
   * Stop the active PiP broadcast.
   * Returns the ended session (for size restoration) or null if idle.
   */
  stopPip: (worktreePath: string) => BroadcastSession | null;

  /** Stop the PiP broadcast that owns this PTY, regardless of worktree. */
  stopPipByPty: (
    ptyId: string,
  ) => { worktreePath: string; session: BroadcastSession } | null;

  /** Get the PiP session for a worktree, or null if none is active. */
  getPip: (worktreePath: string | null | undefined) => BroadcastSession | null;

  /** Check if a specific ptyId is currently broadcasting. */
  isBroadcasting: (ptyId: string) => boolean;

  /** Check if a specific ptyId currently has a mirror broadcast. */
  isMirroring: (ptyId: string) => boolean;

  /** Get the mirror session for a ptyId, or null if not mirroring. */
  getMirror: (ptyId: string) => BroadcastSession | null;
}

export const useBroadcastStore = create<BroadcastState>((set, get) => ({
  mirrors: {},
  pips: {},

  startMirror: (ptyId, paneId, originalCols, originalRows, snapshot = null) => {
    set((state) => ({
      mirrors: {
        ...state.mirrors,
        [ptyId]: {
          ptyId,
          paneId,
          target: "mirror",
          originalCols,
          originalRows,
          snapshot,
        },
      },
    }));
  },

  stopMirror: (ptyId) => {
    const session = get().mirrors[ptyId];
    if (!session) return null;

    set((state) => {
      const nextMirrors = { ...state.mirrors };
      delete nextMirrors[ptyId];
      return { mirrors: nextMirrors };
    });

    return session;
  },

  startPip: (
    worktreePath,
    ptyId,
    paneId,
    originalCols,
    originalRows,
    snapshot = null,
  ) => {
    set((state) => ({
      pips: {
        ...state.pips,
        [worktreePath]: {
          ptyId,
          paneId,
          target: "pip",
          originalCols,
          originalRows,
          snapshot,
        },
      },
    }));
  },

  stopPip: (worktreePath) => {
    const session = get().pips[worktreePath];
    if (!session) return null;

    set((state) => {
      const nextPips = { ...state.pips };
      delete nextPips[worktreePath];
      return { pips: nextPips };
    });

    return session;
  },

  stopPipByPty: (ptyId) => {
    const entry = Object.entries(get().pips).find(([, session]) => session.ptyId === ptyId);
    if (!entry) return null;

    const [worktreePath, session] = entry;
    set((state) => {
      const nextPips = { ...state.pips };
      delete nextPips[worktreePath];
      return { pips: nextPips };
    });

    return { worktreePath, session };
  },

  getPip: (worktreePath) => {
    if (!worktreePath) {
      return null;
    }
    return get().pips[worktreePath] ?? null;
  },

  isBroadcasting: (ptyId) => {
    const { mirrors, pips } = get();
    return Boolean(
      mirrors[ptyId] ||
      Object.values(pips).some((session) => session.ptyId === ptyId),
    );
  },

  isMirroring: (ptyId) => {
    return Boolean(get().mirrors[ptyId]);
  },

  getMirror: (ptyId) => {
    return get().mirrors[ptyId] ?? null;
  },
}));
