import { beforeEach, describe, expect, it } from "vitest";
import { useBroadcastStore } from "./broadcast";

describe("BroadcastStore", () => {
  beforeEach(() => {
    useBroadcastStore.setState({ mirrors: {}, pip: null });
  });

  describe("state transitions", () => {
    it("initializes with no active mirrors or pip", () => {
      const { mirrors, pip } = useBroadcastStore.getState();
      expect(mirrors).toEqual({});
      expect(pip).toBeNull();
    });

    it("idle → mirroring via startMirror", () => {
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      expect(useBroadcastStore.getState().mirrors["pty-1"]).toEqual({
        ptyId: "pty-1",
        paneId: "pane-1",
        target: "mirror",
        originalCols: 120,
        originalRows: 30,
        snapshot: null,
      });
    });

    it("supports multiple mirrors at once", () => {
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      useBroadcastStore.getState().startMirror("pty-2", "pane-2", 100, 28);

      expect(useBroadcastStore.getState().mirrors).toMatchObject({
        "pty-1": {
          ptyId: "pty-1",
          paneId: "pane-1",
          target: "mirror",
        },
        "pty-2": {
          ptyId: "pty-2",
          paneId: "pane-2",
          target: "mirror",
        },
      });
    });

    it("idle → pip via startPip", () => {
      useBroadcastStore.getState().startPip("pty-1", "pane-1", 80, 24);
      expect(useBroadcastStore.getState().pip).toEqual({
        ptyId: "pty-1",
        paneId: "pane-1",
        target: "pip",
        originalCols: 80,
        originalRows: 24,
        snapshot: null,
      });
    });

    it("mirroring → idle for one pty via stopMirror", () => {
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      useBroadcastStore.getState().startMirror("pty-2", "pane-2", 100, 28);

      const result = useBroadcastStore.getState().stopMirror("pty-1");

      expect(useBroadcastStore.getState().mirrors["pty-1"]).toBeUndefined();
      expect(useBroadcastStore.getState().mirrors["pty-2"]).toBeDefined();
      expect(result).toEqual({
        ptyId: "pty-1",
        paneId: "pane-1",
        target: "mirror",
        originalCols: 120,
        originalRows: 30,
        snapshot: null,
      });
    });

    it("pip → idle via stopPip", () => {
      useBroadcastStore.getState().startPip("pty-1", "pane-1", 80, 24);

      const result = useBroadcastStore.getState().stopPip();

      expect(useBroadcastStore.getState().pip).toBeNull();
      expect(result?.target).toBe("pip");
    });

    it("startPip replaces only the pip slot", () => {
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      useBroadcastStore.getState().startPip("pty-2", "pane-2", 80, 24);
      useBroadcastStore.getState().startPip("pty-3", "pane-3", 90, 26);

      expect(useBroadcastStore.getState().mirrors["pty-1"]?.target).toBe("mirror");
      expect(useBroadcastStore.getState().pip?.ptyId).toBe("pty-3");
    });

    it("stopMirror when idle returns null", () => {
      const result = useBroadcastStore.getState().stopMirror("pty-1");
      expect(result).toBeNull();
      expect(useBroadcastStore.getState().mirrors).toEqual({});
    });

    it("stopPip when idle returns null", () => {
      const result = useBroadcastStore.getState().stopPip();
      expect(result).toBeNull();
      expect(useBroadcastStore.getState().pip).toBeNull();
    });
  });

  describe("queries", () => {
    it("isBroadcasting returns true for mirrored ptyId", () => {
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      expect(useBroadcastStore.getState().isBroadcasting("pty-1")).toBe(true);
    });

    it("isBroadcasting returns true for pip ptyId", () => {
      useBroadcastStore.getState().startPip("pty-2", "pane-2", 80, 24);
      expect(useBroadcastStore.getState().isBroadcasting("pty-2")).toBe(true);
    });

    it("isBroadcasting returns false when idle", () => {
      expect(useBroadcastStore.getState().isBroadcasting("pty-1")).toBe(false);
    });

    it("isMirroring returns true only for mirrored ptyId", () => {
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      useBroadcastStore.getState().startPip("pty-2", "pane-2", 80, 24);

      expect(useBroadcastStore.getState().isMirroring("pty-1")).toBe(true);
      expect(useBroadcastStore.getState().isMirroring("pty-2")).toBe(false);
    });

    it("getMirror returns the mirror session for a mirrored ptyId", () => {
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      expect(useBroadcastStore.getState().getMirror("pty-1")?.target).toBe("mirror");
    });

    it("getMirror returns null for non-mirrored ptyId", () => {
      expect(useBroadcastStore.getState().getMirror("pty-1")).toBeNull();
    });
  });

  describe("deterministic transitions", () => {
    it("mirror → stopMirror → idle → pip is valid", () => {
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      useBroadcastStore.getState().stopMirror("pty-1");
      useBroadcastStore.getState().startPip("pty-1", "pane-1", 80, 24);
      expect(useBroadcastStore.getState().pip?.target).toBe("pip");
    });

    it("pip → stopPip → idle → mirror is valid", () => {
      useBroadcastStore.getState().startPip("pty-1", "pane-1", 80, 24);
      useBroadcastStore.getState().stopPip();
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      expect(useBroadcastStore.getState().mirrors["pty-1"]?.target).toBe("mirror");
    });

    it("same ptyId can hold mirror and pip sessions independently", () => {
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      useBroadcastStore.getState().startPip("pty-1", "pane-1", 80, 24);

      expect(useBroadcastStore.getState().mirrors["pty-1"]?.target).toBe("mirror");
      expect(useBroadcastStore.getState().pip?.target).toBe("pip");
    });

    it("stopMirror is idempotent", () => {
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      useBroadcastStore.getState().stopMirror("pty-1");
      useBroadcastStore.getState().stopMirror("pty-1");
      useBroadcastStore.getState().stopMirror("pty-1");
      expect(useBroadcastStore.getState().mirrors).toEqual({});
    });

    it("stopPip is idempotent", () => {
      useBroadcastStore.getState().startPip("pty-1", "pane-1", 80, 24);
      useBroadcastStore.getState().stopPip();
      useBroadcastStore.getState().stopPip();
      useBroadcastStore.getState().stopPip();
      expect(useBroadcastStore.getState().pip).toBeNull();
    });

    it("stopping one mirror does not affect another mirror or pip", () => {
      useBroadcastStore.getState().startMirror("pty-1", "pane-1", 120, 30);
      useBroadcastStore.getState().startMirror("pty-2", "pane-2", 100, 28);
      useBroadcastStore.getState().startPip("pty-3", "pane-3", 80, 24);

      useBroadcastStore.getState().stopMirror("pty-1");

      expect(useBroadcastStore.getState().mirrors["pty-1"]).toBeUndefined();
      expect(useBroadcastStore.getState().mirrors["pty-2"]?.target).toBe("mirror");
      expect(useBroadcastStore.getState().pip?.ptyId).toBe("pty-3");
    });
  });
});
