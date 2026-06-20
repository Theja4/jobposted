import type { ApplicationMode } from "./applications";

export const REVIEW_ATTENTION_STATUSES = ["ready_for_review", "filled"] as const;
export const AUTO_DAILY_QUEUE_STATUSES = ["queued", "submitting", "applied", "submitted"] as const;
export const REVIEW_DAILY_QUEUE_STATUSES = ["queued", "submitting", "submitted"] as const;

const reviewAttention = new Set<string>(REVIEW_ATTENTION_STATUSES);
const autoDaily = new Set<string>(AUTO_DAILY_QUEUE_STATUSES);
const reviewDaily = new Set<string>(REVIEW_DAILY_QUEUE_STATUSES);

export function isReviewAttentionStatus(status: string | null | undefined) {
  return reviewAttention.has(status ?? "");
}

export function queueApplicationVisible({
  status,
  appliedOn,
  queueDate,
  mode,
}: {
  status: string | null | undefined;
  appliedOn: string;
  queueDate: string;
  mode: ApplicationMode;
}) {
  const normalized = status ?? "";
  if (isReviewAttentionStatus(normalized)) return true;
  if (appliedOn !== queueDate) return false;
  return mode === "review" ? reviewDaily.has(normalized) : autoDaily.has(normalized);
}
