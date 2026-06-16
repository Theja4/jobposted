import { describe, expect, it } from "vitest";
import { cronAuthorized, workerHealth } from "./health.js";

describe("worker health", () => {
  it("reports missing required deployment env", () => {
    expect(workerHealth({}).ok).toBe(false);
    expect(workerHealth({}).missing).toContain("JOBPOSTED_WEB_URL or NEXT_PUBLIC_SITE_URL");
    expect(workerHealth({}).missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("accepts cron calls only with the configured bearer token", () => {
    expect(cronAuthorized("Bearer secret", { WORKER_CRON_SECRET: "secret" })).toBe(true);
    expect(cronAuthorized("Bearer wrong", { WORKER_CRON_SECRET: "secret" })).toBe(false);
  });
});
