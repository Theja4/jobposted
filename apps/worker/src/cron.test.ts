import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withWorkerLock } from "./cron.js";
import type { ServiceClient } from "./runner/db.js";

function fakeClient(rpc: ServiceClient["rpc"]): ServiceClient {
  return {
    rpc,
    from: vi.fn(),
    storage: {},
  };
}

describe("withWorkerLock", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.unstubAllEnvs();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("runs and releases when the lock is acquired", async () => {
    const run = vi.fn(async () => "ran");
    const skipped = vi.fn((reason: "lock_held" | "lock_unavailable") => reason);
    const rpc = vi.fn(async (name: string) => {
      if (name === "acquire_worker_lock") return { data: true, error: null };
      if (name === "release_worker_lock") return { data: true, error: null };
      return { data: null, error: null };
    });

    const result = await withWorkerLock(fakeClient(rpc), "apply-runner", 60, skipped, run);

    expect(result).toBe("ran");
    expect(run).toHaveBeenCalledTimes(1);
    expect(skipped).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("release_worker_lock", expect.objectContaining({ p_lock_name: "apply-runner" }));
  });

  it("skips instead of running unlocked when the lock is held", async () => {
    const run = vi.fn(async () => "ran");
    const skipped = vi.fn((reason: "lock_held" | "lock_unavailable") => reason);
    const rpc = vi.fn(async () => ({ data: false, error: null }));

    const result = await withWorkerLock(fakeClient(rpc), "apply-runner", 60, skipped, run);

    expect(result).toBe("lock_held");
    expect(run).not.toHaveBeenCalled();
    expect(skipped).toHaveBeenCalledWith("lock_held");
  });

  it("skips instead of running unlocked when the lock RPC is unavailable", async () => {
    const run = vi.fn(async () => "ran");
    const skipped = vi.fn((reason: "lock_held" | "lock_unavailable") => reason);
    const rpc = vi.fn(async () => {
      throw new Error("function jobposted.acquire_worker_lock does not exist");
    });

    const result = await withWorkerLock(fakeClient(rpc), "apply-runner", 60, skipped, run);

    expect(result).toBe("lock_unavailable");
    expect(run).not.toHaveBeenCalled();
    expect(skipped).toHaveBeenCalledWith("lock_unavailable");
  });

  it("can still be explicitly disabled for local debugging", async () => {
    vi.stubEnv("WORKER_LOCKS_ENABLED", "0");
    const run = vi.fn(async () => "ran");
    const skipped = vi.fn((reason: "lock_held" | "lock_unavailable") => reason);
    const rpc = vi.fn();

    const result = await withWorkerLock(fakeClient(rpc), "apply-runner", 60, skipped, run);

    expect(result).toBe("ran");
    expect(run).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });
});
