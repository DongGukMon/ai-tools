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
  pip: BroadcastSession | null;

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
  stopPip: () => BroadcastSession | null;

  /** Check if a specific ptyId is currently broadcasting. */
  isBroadcasting: (ptyId: string) => boolean;

  /** Check if a specific ptyId currently has a mirror broadcast. */
  isMirroring: (ptyId: string) => boolean;

  /** Get the mirror session for a ptyId, or null if not mirroring. */
  getMirror: (ptyId: string) => BroadcastSession | null;
}

export const useBroadcastStore = create<BroadcastState>((set, get) => ({
  mirrors: {},
  pip: null,

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

  startPip: (ptyId, paneId, originalCols, originalRows, snapshot = null) => {
    set({
      pip: { ptyId, paneId, target: "pip", originalCols, originalRows, snapshot },
    });
  },

  stopPip: () => {
    const { pip } = get();
    if (!pip) return null;
    set({ pip: null });
    return pip;
  },

  isBroadcasting: (ptyId) => {
    const { mirrors, pip } = get();
    return Boolean(mirrors[ptyId] || pip?.ptyId === ptyId);
  },

  isMirroring: (ptyId) => {
    return Boolean(get().mirrors[ptyId]);
  },

  getMirror: (ptyId) => {
    return get().mirrors[ptyId] ?? null;
  },
}));
