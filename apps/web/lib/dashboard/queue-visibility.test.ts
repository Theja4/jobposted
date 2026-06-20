import { describe, expect, it } from "vitest";
import { queueApplicationVisible } from "./queue-visibility";

describe("queueApplicationVisible", () => {
  it("carries review-needed applications in both modes", () => {
    for (const mode of ["auto", "review"] as const) {
      expect(
        queueApplicationVisible({
          status: "ready_for_review",
          appliedOn: "2026-06-18",
          queueDate: "2026-06-20",
          mode,
        }),
      ).toBe(true);
    }
  });

  it("keeps normal auto queue statuses scoped to the current day", () => {
    expect(
      queueApplicationVisible({
        status: "queued",
        appliedOn: "2026-06-20",
        queueDate: "2026-06-20",
        mode: "auto",
      }),
    ).toBe(true);
    expect(
      queueApplicationVisible({
        status: "queued",
        appliedOn: "2026-06-19",
        queueDate: "2026-06-20",
        mode: "auto",
      }),
    ).toBe(false);
  });

  it("keeps review-mode released rows scoped to the current day", () => {
    expect(
      queueApplicationVisible({
        status: "submitted",
        appliedOn: "2026-06-20",
        queueDate: "2026-06-20",
        mode: "review",
      }),
    ).toBe(true);
    expect(
      queueApplicationVisible({
        status: "applied",
        appliedOn: "2026-06-20",
        queueDate: "2026-06-20",
        mode: "review",
      }),
    ).toBe(false);
  });
});
