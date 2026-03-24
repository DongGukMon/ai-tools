import { create } from "zustand";

export type BroadcastTarget = "mirror" | "pip";

export interface BroadcastSession {
  ptyId: string;
  paneId: string;
  target: BroadcastTarget;
  originalCols: number;
  originalRows: number;
}

interface BroadcastState {
  active: BroadcastSession | null;

  /**
   * Start broadcasting a terminal pane to a target.
   * If already broadcasting, replaces the current session.
   */
  startBroadcast: (
    ptyId: string,
    paneId: string,
    target: BroadcastTarget,
    originalCols: number,
    originalRows: number,
  ) => void;

  /**
   * Stop the active broadcast.
   * Returns the ended session (for size restoration) or null if idle.
   */
  stopBroadcast: () => BroadcastSession | null;

  /** Check if a specific ptyId is currently broadcasting. */
  isBroadcasting: (ptyId: string) => boolean;

  /** Get the broadcast target for a ptyId, or null if not broadcasting. */
  getBroadcastTarget: (ptyId: string) => BroadcastTarget | null;
}

export const useBroadcastStore = create<BroadcastState>((set, get) => ({
  active: null,

  startBroadcast: (ptyId, paneId, target, originalCols, originalRows) => {
    set({
      active: { ptyId, paneId, target, originalCols, originalRows },
    });
  },

  stopBroadcast: () => {
    const { active } = get();
    if (!active) return null;
    set({ active: null });
    return active;
  },

  isBroadcasting: (ptyId) => {
    const { active } = get();
    return active?.ptyId === ptyId;
  },

  getBroadcastTarget: (ptyId) => {
    const { active } = get();
    return active?.ptyId === ptyId ? active.target : null;
  },
}));
