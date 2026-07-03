import { describe, expect, it } from "vitest";
import { normalizedBillingWebhookEvent, statusFromEvent } from "@/lib/billing/webhook";

describe("billing webhook normalization", () => {
  it("lets subscription.update payload status win over the event type", () => {
    expect(statusFromEvent("subscription.update", "past_due")).toBe("past_due");
    expect(statusFromEvent("subscription.update", "canceled")).toBe("canceled");
  });

  it("still maps explicit subscription lifecycle events when no update status is present", () => {
    expect(statusFromEvent("subscription.active", "canceled")).toBe("active");
    expect(statusFromEvent("subscription.canceled", "active")).toBe("canceled");
  });

  it("extracts a provider event timestamp for stale-event guards", () => {
    const event = normalizedBillingWebhookEvent({
      type: "subscription.update",
      created_at: "2026-07-03T10:15:00.000Z",
      object: {
        status: "past_due",
        request_id: "jobposted:user_1:jobposted_20:monthly",
        subscription_id: "sub_123",
        customer_id: "cus_123",
      },
    });

    expect(event).toMatchObject({
      userId: "user_1",
      plan: "jobposted_20",
      status: "past_due",
      eventOccurredAt: "2026-07-03T10:15:00.000Z",
    });
  });

  it("normalizes numeric provider timestamps", () => {
    expect(
      normalizedBillingWebhookEvent({
        type: "subscription.canceled",
        created: 1783073700,
        object: {
          status: "canceled",
          request_id: "jobposted:user_1:jobposted_20:monthly",
        },
      }).eventOccurredAt,
    ).toBe("2026-07-03T10:15:00.000Z");
  });
});
