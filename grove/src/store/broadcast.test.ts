import { beforeEach, describe, expect, it } from "vitest";
import { useBroadcastStore } from "./broadcast";

describe("BroadcastStore", () => {
  beforeEach(() => {
    useBroadcastStore.setState({ active: null });
  });

  describe("state transitions", () => {
    it("initializes with no active broadcast", () => {
      expect(useBroadcastStore.getState().active).toBeNull();
    });

    it("idle → broadcasting(mirror) via startBroadcast", () => {
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "mirror", 120, 30);
      const { active } = useBroadcastStore.getState();
      expect(active).toEqual({
        ptyId: "pty-1",
        paneId: "pane-1",
        target: "mirror",
        originalCols: 120,
        originalRows: 30,
      });
    });

    it("idle → broadcasting(pip) via startBroadcast", () => {
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "pip", 80, 24);
      expect(useBroadcastStore.getState().active?.target).toBe("pip");
    });

    it("broadcasting → idle via stopBroadcast", () => {
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "mirror", 120, 30);
      const result = useBroadcastStore.getState().stopBroadcast();
      expect(useBroadcastStore.getState().active).toBeNull();
      expect(result).toEqual({
        ptyId: "pty-1",
        paneId: "pane-1",
        target: "mirror",
        originalCols: 120,
        originalRows: 30,
      });
    });

    it("startBroadcast while already broadcasting replaces previous", () => {
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "mirror", 120, 30);
      useBroadcastStore.getState().startBroadcast("pty-2", "pane-2", "pip", 80, 24);
      const { active } = useBroadcastStore.getState();
      expect(active?.ptyId).toBe("pty-2");
      expect(active?.target).toBe("pip");
    });

    it("stopBroadcast when idle returns null", () => {
      const result = useBroadcastStore.getState().stopBroadcast();
      expect(result).toBeNull();
      expect(useBroadcastStore.getState().active).toBeNull();
    });
  });

  describe("queries", () => {
    it("isBroadcasting returns true for active ptyId", () => {
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "mirror", 120, 30);
      expect(useBroadcastStore.getState().isBroadcasting("pty-1")).toBe(true);
    });

    it("isBroadcasting returns false for different ptyId", () => {
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "mirror", 120, 30);
      expect(useBroadcastStore.getState().isBroadcasting("pty-2")).toBe(false);
    });

    it("isBroadcasting returns false when idle", () => {
      expect(useBroadcastStore.getState().isBroadcasting("pty-1")).toBe(false);
    });

    it("getBroadcastTarget returns target for active ptyId", () => {
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "mirror", 120, 30);
      expect(useBroadcastStore.getState().getBroadcastTarget("pty-1")).toBe("mirror");
    });

    it("getBroadcastTarget returns null for non-broadcasting ptyId", () => {
      expect(useBroadcastStore.getState().getBroadcastTarget("pty-1")).toBeNull();
    });
  });

  describe("deterministic transitions", () => {
    it("mirror → stopBroadcast → idle → pip is valid", () => {
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "mirror", 120, 30);
      useBroadcastStore.getState().stopBroadcast();
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "pip", 80, 24);
      expect(useBroadcastStore.getState().active?.target).toBe("pip");
    });

    it("pip → stopBroadcast → idle → mirror is valid", () => {
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "pip", 80, 24);
      useBroadcastStore.getState().stopBroadcast();
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "mirror", 120, 30);
      expect(useBroadcastStore.getState().active?.target).toBe("mirror");
    });

    it("same ptyId cannot broadcast to two targets simultaneously", () => {
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "mirror", 120, 30);
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "pip", 80, 24);
      // Replaced, not stacked
      expect(useBroadcastStore.getState().active?.target).toBe("pip");
    });

    it("stopBroadcast is idempotent", () => {
      useBroadcastStore.getState().startBroadcast("pty-1", "pane-1", "mirror", 120, 30);
      useBroadcastStore.getState().stopBroadcast();
      useBroadcastStore.getState().stopBroadcast();
      useBroadcastStore.getState().stopBroadcast();
      expect(useBroadcastStore.getState().active).toBeNull();
    });
  });
});
