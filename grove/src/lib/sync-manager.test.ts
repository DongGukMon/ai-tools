import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerSyncJob,
  startSyncManager,
  stopSyncManager,
  unregisterSyncJob,
} from "./sync-manager";

describe("sync-manager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopSyncManager();
    unregisterSyncJob("test-job");
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("runs jobs immediately by default", async () => {
    const job = vi.fn().mockResolvedValue(undefined);

    registerSyncJob("test-job", job, 10_000);
    startSyncManager();
    await vi.runOnlyPendingTimersAsync();

    expect(job).toHaveBeenCalledTimes(1);
  });

  it("can skip immediate execution on startup", async () => {
    const job = vi.fn().mockResolvedValue(undefined);

    registerSyncJob("test-job", job, 10_000);
    startSyncManager({ runImmediately: false });
    await vi.advanceTimersByTimeAsync(9_000);

    expect(job).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(job).toHaveBeenCalledTimes(1);
  });
});
