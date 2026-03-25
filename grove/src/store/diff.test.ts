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

describe("line selection", () => {
  beforeEach(() => {
    useDiffStore.setState({ selectedLines: new Set() });
  });

  it("selectLine sets a single line", () => {
    useDiffStore.getState().selectLine(5);
    expect(useDiffStore.getState().selectedLines).toEqual(new Set([5]));
  });

  it("toggleLine adds and removes", () => {
    useDiffStore.getState().toggleLine(3);
    expect(useDiffStore.getState().selectedLines).toEqual(new Set([3]));
    useDiffStore.getState().toggleLine(3);
    expect(useDiffStore.getState().selectedLines).toEqual(new Set());
  });

  it("selectLineRange selects inclusive range", () => {
    useDiffStore.getState().selectLineRange(2, 5);
    expect(useDiffStore.getState().selectedLines).toEqual(new Set([2, 3, 4, 5]));
  });

  it("selectLineRange works in reverse", () => {
    useDiffStore.getState().selectLineRange(5, 2);
    expect(useDiffStore.getState().selectedLines).toEqual(new Set([2, 3, 4, 5]));
  });

  it("clearSelection empties set", () => {
    useDiffStore.getState().selectLine(1);
    useDiffStore.getState().clearSelection();
    expect(useDiffStore.getState().selectedLines).toEqual(new Set());
  });
});
