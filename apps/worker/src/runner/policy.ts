/** Pure decision logic for the apply runner — fully unit-testable, no I/O. */

export type AttemptDecision =
  | { proceed: true }
  | { proceed: false; outcome: "limit_reached" | "too_many_attempts"; release: boolean };

/**
 * Decide whether to submit one claimed application.
 * - Daily limit reached → release back to the queue (try again after the day rolls over).
 * - Too many attempts → do NOT release; it becomes a permanent failure for human review.
 */
export function decideAttempt(input: {
  todaySubmitted: number;
  dailyLimit: number;
  attempts: number; // includes the current (just-incremented) attempt
  maxAttempts: number;
}): AttemptDecision {
  if (input.todaySubmitted >= input.dailyLimit) {
    return { proceed: false, outcome: "limit_reached", release: true };
  }
  if (input.attempts > input.maxAttempts) {
    return { proceed: false, outcome: "too_many_attempts", release: false };
  }
  return { proceed: true };
}

const PERMANENT_PATTERNS = [
  "unsupported", // no adapter for this ATS
  "adapter_not_server_safe",
  "no_resume",
  "no_job_url",
  "login_required",
  "authentication",
  "captcha",
  "closed_job",
  "account",
  "form_not_found",
  "missing_required_field",
];

const TRANSIENT_PATTERNS = ["timeout", "timed out", "network", "econn", "navigation", "5", "429", "temporarily"];

/**
 * Classify a failure reason as permanent (route to human review, don't retry) or transient
 * (release for another attempt). Unknown reasons are treated as transient up to the attempt cap,
 * so a one-off glitch retries but a persistent problem eventually surfaces for review.
 */
export function classifyFailure(reason: string): { permanent: boolean } {
  const text = reason.toLowerCase();
  if (PERMANENT_PATTERNS.some((p) => text.includes(p))) return { permanent: true };
  if (TRANSIENT_PATTERNS.some((p) => text.includes(p))) return { permanent: false };
  return { permanent: false };
}

/** Final status for a failed application given its classification and remaining attempts. */
export function failureStatus(input: {
  permanent: boolean;
  attempts: number;
  maxAttempts: number;
}): "queued" | "failed" | "ready_for_review" {
  if (input.permanent) return "ready_for_review"; // surface to the user, don't auto-retry
  if (input.attempts >= input.maxAttempts) return "failed";
  return "queued"; // transient + attempts left → retry on the next run
}
