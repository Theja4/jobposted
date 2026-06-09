import { db } from "./supabase";

export interface ClaimedApplication {
  id: string;
  user_id: string;
  job_id: string;
  status: string;
  field_map: unknown;
  attempts: number | null;
}

/** Atomic optimistic claim: status guard prevents two workers grabbing the same row. */
export async function claimApply(): Promise<ClaimedApplication | null> {
  const { data: cand } = await db()
    .from("applications")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!cand) return null;

  const { data: claimed } = await db()
    .from("applications")
    .update({ status: "tailoring", claimed_at: new Date().toISOString() })
    .eq("id", cand.id)
    .eq("status", "queued") // someone else may have grabbed it
    .select("id,user_id,job_id,status,field_map,attempts")
    .maybeSingle();
  return (claimed as ClaimedApplication | null) ?? null;
}

/** Claim a confirmed application for submission, guarding against a stale/parallel claim. */
export async function claimSubmit(): Promise<ClaimedApplication | null> {
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: cand } = await db()
    .from("applications")
    .select("id, claimed_at")
    .eq("status", "submitting")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!cand) return null;
  // Skip if another worker claimed it within the last 5 minutes.
  if (cand.claimed_at && cand.claimed_at > staleBefore) return null;

  const { data: claimed } = await db()
    .from("applications")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", cand.id)
    .eq("status", "submitting")
    .select("id,user_id,job_id,status,field_map,attempts")
    .maybeSingle();
  return (claimed as ClaimedApplication | null) ?? null;
}

export interface JobRow {
  id: string;
  company: string | null;
  title: string | null;
  ats_type: string | null;
  apply_url: string | null;
  description_md: string | null;
  form_questions: unknown;
}

export async function getJob(jobId: string): Promise<JobRow | null> {
  const { data } = await db()
    .from("jobs")
    .select("id,company,title,ats_type,apply_url,description_md,form_questions")
    .eq("id", jobId)
    .maybeSingle();
  return (data as JobRow | null) ?? null;
}

export async function countSubmittedToday(userId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count } = await db()
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("submitted_at", start.toISOString());
  return count ?? 0;
}

export async function dailyLimitFor(userId: string): Promise<number> {
  const { data } = await db()
    .from("subscriptions")
    .select("daily_limit")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.daily_limit ?? 100; // no subscription → fall back to the direct-ATS safety ceiling
}

type Status =
  | "queued"
  | "tailoring"
  | "ready_for_review"
  | "submitting"
  | "submitted"
  | "failed";

export async function setStatus(
  id: string,
  status: Status,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await db().from("applications").update({ status, ...patch }).eq("id", id);
}
