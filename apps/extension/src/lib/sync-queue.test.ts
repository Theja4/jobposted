import { describe, expect, it } from "vitest";
import { dueApplicationSyncs, retryDelayMs, syncQueueStatusFrom } from "./sync-queue";

const payload = {
  source: "extension" as const,
  platform: "greenhouse" as const,
  company: "Acme",
  role: "Product Manager",
  jobUrl: "https://boards.greenhouse.io/acme/jobs/1",
  status: "filled" as const,
  appliedAt: "2026-06-15T00:00:00.000Z",
  fieldsFilled: [],
};

describe("extension sync queue helpers", () => {
  it("uses increasing retry delays", () => {
    expect(retryDelayMs(0)).toBeLessThan(retryDelayMs(2));
    expect(retryDelayMs(10)).toBe(retryDelayMs(4));
  });

  it("finds due syncs by next retry time", () => {
    expect(
      dueApplicationSyncs(
        [
          {
            id: "due",
            dedupeKey: "due",
            payload,
            attempts: 1,
            queuedAt: "2026-06-15T00:00:00.000Z",
            nextRetryAt: "2026-06-15T00:00:01.000Z",
          },
          {
            id: "later",
            dedupeKey: "later",
            payload,
            attempts: 1,
            queuedAt: "2026-06-15T00:00:00.000Z",
            nextRetryAt: "2026-06-15T00:10:00.000Z",
          },
        ],
        Date.parse("2026-06-15T00:00:02.000Z"),
      ).map((item) => item.id),
    ).toEqual(["due"]);
  });

  it("summarizes pending status", () => {
    expect(
      syncQueueStatusFrom([
        {
          id: "one",
          dedupeKey: "one",
          payload,
          attempts: 1,
          queuedAt: "2026-06-15T00:00:00.000Z",
          lastError: "network_unavailable",
          nextRetryAt: "2026-06-15T00:01:00.000Z",
        },
      ]),
    ).toMatchObject({
      pending: 1,
      lastError: "network_unavailable",
      nextRetryAt: "2026-06-15T00:01:00.000Z",
    });
  });
});
