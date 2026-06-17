import { describe, expect, it } from "vitest";
import { computeUsageStatus } from "./usage";

describe("computeUsageStatus", () => {
  it("blocks users without an active subscription", () => {
    expect(
      computeUsageStatus({ subscription: null, totalSubmitted: 2, todaySubmitted: 2 }),
    ).toMatchObject({ canSubmit: false, plan: "jobposted_20", reason: "subscription_inactive" });
  });

  it("does not grant access for trialing subscriptions", () => {
    expect(
      computeUsageStatus({
        subscription: { plan: "jobposted_20", status: "trialing", dailyLimit: 20 },
        totalSubmitted: 0,
        todaySubmitted: 0,
      }),
    ).toMatchObject({ canSubmit: false, reason: "subscription_inactive" });
  });

  it("blocks active plans at the daily limit", () => {
    expect(
      computeUsageStatus({
        subscription: { plan: "jobposted_20", status: "active", dailyLimit: 20 },
        totalSubmitted: 30,
        todaySubmitted: 20,
      }),
    ).toMatchObject({ canSubmit: false, reason: "daily_limit_reached" });
  });
});
