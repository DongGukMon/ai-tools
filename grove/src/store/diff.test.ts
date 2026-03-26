import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/platform", () => ({
  getStatus: vi.fn(),
  getCommits: vi.fn(),
  getBehindCount: vi.fn(),
  mergeDefaultBranch: vi.fn(),
  getWorkingDiff: vi.fn(),
  getCommitDiff: vi.fn(),
  stageFile: vi.fn(),
  unstageFile: vi.fn(),
  discardFile: vi.fn(),
  stageHunk: vi.fn(),
  unstageHunk: vi.fn(),
  discardHunk: vi.fn(),
  stageLines: vi.fn(),
  unstageLines: vi.fn(),
  discardLines: vi.fn(),
}));

vi.mock("../lib/command", () => ({
  runCommandSafely: vi.fn(),
  runCommand: vi.fn(),
}));

vi.mock("../store/toast", () => ({
  useToastStore: {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  },
}));

import { useDiffStore } from "./diff";

describe("line selection (per-file scoped)", () => {
  beforeEach(() => {
    useDiffStore.setState({ selectedLines: new Map() });
  });

  it("selectLine sets a single line for a file", () => {
    useDiffStore.getState().selectLine("file-a", 5);
    expect(useDiffStore.getState().selectedLines.get("file-a")).toEqual(new Set([5]));
  });

  it("toggleLine adds and removes for a file", () => {
    useDiffStore.getState().toggleLine("file-a", 3);
    expect(useDiffStore.getState().selectedLines.get("file-a")).toEqual(new Set([3]));
    useDiffStore.getState().toggleLine("file-a", 3);
    expect(useDiffStore.getState().selectedLines.get("file-a")?.size ?? 0).toBe(0);
  });

  it("selectLineRange selects inclusive range for a file", () => {
    useDiffStore.getState().selectLineRange("file-a", 2, 5);
    expect(useDiffStore.getState().selectedLines.get("file-a")).toEqual(new Set([2, 3, 4, 5]));
  });

  it("selectLineRange works in reverse", () => {
    useDiffStore.getState().selectLineRange("file-a", 5, 2);
    expect(useDiffStore.getState().selectedLines.get("file-a")).toEqual(new Set([2, 3, 4, 5]));
  });

  it("selections are independent per file", () => {
    useDiffStore.getState().selectLine("file-a", 1);
    useDiffStore.getState().selectLine("file-b", 2);
    expect(useDiffStore.getState().selectedLines.get("file-a")).toEqual(new Set([1]));
    expect(useDiffStore.getState().selectedLines.get("file-b")).toEqual(new Set([2]));
  });

  it("clearSelection empties all files", () => {
    useDiffStore.getState().selectLine("file-a", 1);
    useDiffStore.getState().selectLine("file-b", 2);
    useDiffStore.getState().clearSelection();
    expect(useDiffStore.getState().selectedLines.size).toBe(0);
  });
});
