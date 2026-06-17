import { describe, expect, it } from "vitest";
import { classifyFailure, decideAttempt, failureStatus } from "./policy.js";

describe("decideAttempt", () => {
  const base = {
    todaySubmitted: 0,
    dailyLimit: 20,
    canSubmit: true,
    reason: "ok" as const,
    attempts: 1,
    maxAttempts: 3,
  };

  it("proceeds within limits", () => {
    expect(decideAttempt(base)).toEqual({ proceed: true });
  });

  it("releases when the daily limit is reached", () => {
    expect(decideAttempt({ ...base, todaySubmitted: 20 })).toEqual({
      proceed: false,
      outcome: "daily_limit_reached",
      status: "queued",
      releaseAttempt: true,
    });
  });

  it("routes inactive subscriptions to review without burning an attempt", () => {
    expect(decideAttempt({ ...base, canSubmit: false, reason: "subscription_inactive" })).toEqual({
      proceed: false,
      outcome: "subscription_inactive",
      status: "ready_for_review",
      releaseAttempt: true,
    });
  });

  it("does not release after too many attempts", () => {
    expect(decideAttempt({ ...base, attempts: 4 })).toEqual({
      proceed: false,
      outcome: "too_many_attempts",
      status: "failed",
      releaseAttempt: false,
    });
  });

  it("limit check takes precedence over attempts", () => {
    const decision = decideAttempt({ ...base, todaySubmitted: 20, attempts: 9 });
    expect(decision.proceed).toBe(false);
    if (!decision.proceed) expect(decision.outcome).toBe("daily_limit_reached");
  });
});

describe("classifyFailure", () => {
  it("marks adapter/auth/captcha problems permanent", () => {
    expect(classifyFailure("unsupported_ats").permanent).toBe(true);
    expect(classifyFailure("login_required to continue").permanent).toBe(true);
    expect(classifyFailure("hit a CAPTCHA wall").permanent).toBe(true);
    expect(classifyFailure("no_resume_artifact").permanent).toBe(true);
  });

  it("marks timeouts/network as transient", () => {
    expect(classifyFailure("Navigation timeout of 30000ms exceeded").permanent).toBe(false);
    expect(classifyFailure("network error ECONNRESET").permanent).toBe(false);
  });

  it("treats unknown reasons as transient (retryable)", () => {
    expect(classifyFailure("something weird happened").permanent).toBe(false);
  });
});

describe("failureStatus", () => {
  it("routes permanent failures to review", () => {
    expect(failureStatus({ permanent: true, attempts: 1, maxAttempts: 3 })).toBe("ready_for_review");
  });
  it("re-queues transient failures with attempts left", () => {
    expect(failureStatus({ permanent: false, attempts: 1, maxAttempts: 3 })).toBe("queued");
  });
  it("fails transient failures once attempts are exhausted", () => {
    expect(failureStatus({ permanent: false, attempts: 3, maxAttempts: 3 })).toBe("failed");
  });
});
