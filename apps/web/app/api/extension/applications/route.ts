import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { ExtensionApplicationUpsert } from "@jobposted/shared";
import { getUsageStatus, usageLimitMessage } from "@/lib/billing/limits";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";
import {
  buildExtensionApplicationRow,
  type ExistingExtensionApplicationRow,
} from "@/lib/extension/application-sync";

export const runtime = "nodejs";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeJobUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.toString();
  } catch {
    return trimmed;
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function jobUrlCandidates(jobUrl: string) {
  return uniqueStrings([normalizeJobUrl(jobUrl), jobUrl]);
}

function sourceJobId(jobUrl: string, fallback: string) {
  return createHash("sha256").update(jobUrl || fallback).digest("hex").slice(0, 32);
}

type SchemaScopedClient = { from: (table: string) => any };

async function findExistingJobId(client: SchemaScopedClient, userId: string, jobUrl: string) {
  const candidates = jobUrlCandidates(jobUrl);
  if (candidates.length === 0) return null;

  const { data: jobs, error: jobsError } = await client
    .from("jobs")
    .select("id,apply_url,source")
    .in("apply_url", candidates)
    .limit(20);
  if (jobsError) {
    console.error("extension job lookup failed", jobsError);
    return null;
  }
  const jobIds = Array.isArray(jobs)
    ? jobs.map((job) => asString((job as Record<string, unknown>).id)).filter(Boolean)
    : [];
  if (jobIds.length === 0) return null;

  const { data: applications, error: applicationsError } = await client
    .from("applications")
    .select("job_id,resume_doc_id,rendered_pdf_path,created_at")
    .eq("user_id", userId)
    .in("job_id", jobIds)
    .order("created_at", { ascending: false })
    .limit(20);
  if (applicationsError) {
    console.error("extension application lookup failed", applicationsError);
    return jobIds[0] ?? null;
  }

  const rows = Array.isArray(applications) ? applications : [];
  const withResume = rows.find((row) => {
    const record = row as Record<string, unknown>;
    return Boolean(asString(record.resume_doc_id) || asString(record.rendered_pdf_path));
  });
  const matchedApplication = withResume ?? rows[0];
  return matchedApplication ? asString((matchedApplication as Record<string, unknown>).job_id) || null : jobIds[0] ?? null;
}

async function findExistingApplication(client: SchemaScopedClient, userId: string, jobId: string) {
  const { data, error } = await client
    .from("applications")
    .select(
      "id,job_id,status,resume_doc_id,cover_letter_doc_id,field_map,screenshot_path,base_version_id,resume_variant_id,tailoring_delta,rendered_pdf_path,submitted_at",
    )
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) {
    console.error("extension existing application lookup failed", error);
    return null;
  }
  return (data as ExistingExtensionApplicationRow | null) ?? null;
}

function validPayload(value: unknown): value is ExtensionApplicationUpsert {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.source === "extension" &&
    typeof v.platform === "string" &&
    typeof v.company === "string" &&
    typeof v.role === "string" &&
    typeof v.jobUrl === "string" &&
    (v.status === "filled" || v.status === "submitted") &&
    typeof v.appliedAt === "string" &&
    Array.isArray(v.fieldsFilled)
  );
}

export async function POST(request: Request) {
  try {
    const auth = await getExtensionAuthContext(request);
    const payload = (await request.json().catch(() => null)) as unknown;
    if (!validPayload(payload)) {
      return extensionError("Invalid application payload.", 400);
    }

    const writeClient = getServiceRoleClient();
    const supabase = writeClient ?? auth.supabase;
    const jobUrl = normalizeJobUrl(asString(payload.jobUrl));
    const company = asString(payload.company) || "Unknown company";
    const role = asString(payload.role) || "Unknown role";
    let jobId = asString(payload.jobId) || null;
    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("active_resume_version_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    const activeResumeVersionId =
      typeof profile?.active_resume_version_id === "string" ? profile.active_resume_version_id : null;

    if (payload.status === "submitted") {
      const usage = await getUsageStatus(auth.supabase, auth.user.id);
      if (!usage.canSubmit) {
        return extensionError(usageLimitMessage(usage), 402);
      }
    }

    if (!jobId) {
      jobId = await findExistingJobId(supabase, auth.user.id, jobUrl);
    }

    if (!jobId && writeClient) {
      const { data: job, error: jobError } = await writeClient
        .from("jobs")
        .upsert(
          {
            source: "extension",
            source_job_id: sourceJobId(jobUrl, `${payload.platform}:${company}:${role}`),
            ats_type: payload.platform,
            company,
            title: role,
            location: null,
            remote: "unknown",
            description_md: null,
            apply_url: jobUrl,
            form_questions: [],
            salary_min: null,
            salary_max: null,
            salary_currency: null,
            visa_sponsorship: null,
            posted_at: null,
            last_seen_at: new Date().toISOString(),
            closed_at: null,
          },
          { onConflict: "source,source_job_id" },
        )
        .select("id")
        .single();
      if (jobError) {
        console.error("extension job upsert failed", jobError);
        return extensionError("Could not sync the application job.", 500);
      }
      jobId = job?.id ?? null;
    }

    const existingApplication = jobId ? await findExistingApplication(supabase, auth.user.id, jobId) : null;
    const applicationRow = buildExtensionApplicationRow({
      userId: auth.user.id,
      jobId,
      payload,
      jobUrl,
      company,
      role,
      activeResumeVersionId,
      existingApplication,
    });

    const query = existingApplication
      ? supabase.from("applications").update(applicationRow).eq("id", existingApplication.id).select("id,job_id").single()
      : supabase.from("applications").insert(applicationRow).select("id,job_id").single();

    const { data: application, error: applicationError } = await query;
    if (applicationError) {
      console.error("extension application upsert failed", applicationError);
      return extensionError("Could not sync the application.", 500);
    }

    return NextResponse.json({
      ok: true,
      applicationId: application?.id ?? null,
      jobId: application?.job_id ?? jobId,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
