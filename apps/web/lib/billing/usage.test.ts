import { describe, expect, it } from "vitest";
import { computeUsageStatus } from "./usage";

describe("computeUsageStatus", () => {
  it("allows trial users under the five application trial", () => {
    expect(
      computeUsageStatus({ subscription: null, totalSubmitted: 2, todaySubmitted: 2 }),
    ).toMatchObject({ canSubmit: true, plan: "trial", trialRemaining: 3 });
  });

  it("blocks when the trial is exhausted", () => {
    expect(
      computeUsageStatus({ subscription: null, totalSubmitted: 5, todaySubmitted: 1 }),
    ).toMatchObject({ canSubmit: false, reason: "trial_exhausted" });
  });

  it("blocks active plans at the daily limit", () => {
    expect(
      computeUsageStatus({
        subscription: { plan: "starter_20", status: "active", dailyLimit: 20 },
        totalSubmitted: 30,
        todaySubmitted: 20,
      }),
    ).toMatchObject({ canSubmit: false, reason: "daily_limit_reached" });
  });
});
