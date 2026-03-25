import { beforeEach, describe, expect, it, vi } from "vitest";

const runCommandSafelyMock = vi.fn();

vi.mock("../../lib/command", () => ({
  runCommandSafely: (...args: Parameters<typeof runCommandSafelyMock>) =>
    runCommandSafelyMock(...args),
}));

vi.mock("../../lib/platform", () => ({
  getWorktreePrUrl: vi.fn(),
}));

import * as platform from "../../lib/platform";
import {
  createWorktreePrLookupKey,
  resetWorktreePrLookupState,
  selectWorktreePrEntry,
  useWorktreePrStore,
} from "./worktree-pr";

describe("worktree PR lookup cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runCommandSafelyMock.mockImplementation(
      async (action: () => Promise<unknown>) => action(),
    );
    resetWorktreePrLookupState();
  });

  it("builds a repo-and-branch cache key only when enough context exists", () => {
    expect(createWorktreePrLookupKey("bang9", "grove", "feature/pr")).toBe(
      "bang9/grove:feature/pr",
    );
    expect(createWorktreePrLookupKey("bang9", "grove", "")).toBeNull();
  });

  it("returns a stable empty entry when no cache key exists", () => {
    const first = selectWorktreePrEntry(useWorktreePrStore.getState(), null);
    const second = selectWorktreePrEntry(useWorktreePrStore.getState(), null);

    expect(first).toBe(second);
    expect(first).toEqual({
      loading: false,
      url: null,
      fetchedAt: null,
    });
  });

  it("deduplicates inflight lookups for the same repo and branch", async () => {
    let resolveLookup!: (value: string | null) => void;
    const lookupPromise = new Promise<string | null>((resolve) => {
      resolveLookup = resolve;
    });
    vi.mocked(platform.getWorktreePrUrl).mockReturnValue(lookupPromise);

    const promiseA = useWorktreePrStore
      .getState()
      .ensureWorktreePrUrl("bang9/grove:feature/pr", "/tmp/worktree-a");
    const promiseB = useWorktreePrStore
      .getState()
      .ensureWorktreePrUrl("bang9/grove:feature/pr", "/tmp/worktree-a");

    expect(vi.mocked(platform.getWorktreePrUrl)).toHaveBeenCalledTimes(1);
    expect(selectWorktreePrEntry(useWorktreePrStore.getState(), "bang9/grove:feature/pr")).toMatchObject({
      loading: true,
      url: null,
    });

    resolveLookup("https://github.com/bang9/grove/pull/42");
    await Promise.all([promiseA, promiseB]);

    expect(selectWorktreePrEntry(useWorktreePrStore.getState(), "bang9/grove:feature/pr")).toMatchObject({
      loading: false,
      url: "https://github.com/bang9/grove/pull/42",
    });
  });
});
