import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  resolveCompanyAssetsFromJobUrl,
  type ExtensionApplicationUpsert,
  type ExtensionTrackerItem,
} from "@jobposted/shared";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";
import {
  buildExtensionApplicationRow,
  canonicalizeJobUrl,
  type ExistingExtensionApplicationRow,
} from "@/lib/extension/application-sync";
import { mapTrackerApplicationRow } from "@/lib/dashboard/tracker";
import { statusForTrackerStage, trackerStageFromInput } from "@/lib/dashboard/tracker-model";

// Columns the tracker mapper needs, plus the notes column, the joined job, and the
// attached resume document (so its name/id resolve without a field_map round-trip).
const TRACKER_SELECT =
  "id,status,apply_path,submitted_at,created_at,rendered_pdf_path,field_map,failure_reason,notes,resume_doc_id," +
  "jobs:job_id(id,company,company_domain,company_logo_url,title,location,apply_url,ats_type,source)," +
  "resume:resume_doc_id(id,storage_path,created_at)";

function fileNameFromPath(path: string | null | undefined): string {
  if (!path) return "";
  try {
    return decodeURIComponent(path.split("/").pop() || "");
  } catch {
    return path.split("/").pop() || "";
  }
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toExtensionTrackerItem(row: Record<string, unknown>): ExtensionTrackerItem {
  const item = mapTrackerApplicationRow(row as unknown as Parameters<typeof mapTrackerApplicationRow>[0]);
  const notesColumn = typeof row.notes === "string" && row.notes.trim() ? row.notes.trim() : null;
  const resumeDoc = firstOf(row.resume as { id?: string; storage_path?: string } | Array<{ id?: string; storage_path?: string }> | null);
  const resumeDocId =
    (resumeDoc && typeof resumeDoc.id === "string" ? resumeDoc.id : null) ??
    (typeof row.resume_doc_id === "string" ? row.resume_doc_id : null);
  const resumeName = resumeDoc?.storage_path ? fileNameFromPath(resumeDoc.storage_path) || item.resumeName : item.resumeName;
  return {
    id: item.id,
    jobId: item.jobId,
    company: item.company,
    role: item.role,
    companyLogoUrl: item.companyLogoUrl,
    status: item.status,
    stage: item.stage,
    matchScore: item.matchScore,
    resumeName,
    resumeUrl: item.resumeUrl,
    resumeDocId,
    jobUrl: item.jobUrl,
    appliedOn: item.appliedOn,
    updatedAt: item.updatedAt,
    notes: notesColumn ?? item.notes,
  };
}

export const runtime = "nodejs";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function jobUrlCandidates(jobUrl: string) {
  return uniqueStrings([canonicalizeJobUrl(jobUrl), jobUrl]);
}

function sourceJobId(jobUrl: string, fallback: string) {
  return createHash("sha256").update(jobUrl || fallback).digest("hex").slice(0, 32);
}

function errorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Unknown error.";
  const record = error as Record<string, unknown>;
  return asString(record.message) || asString(record.details) || asString(record.hint) || "Unknown error.";
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
    const jobUrl = canonicalizeJobUrl(asString(payload.jobUrl));
    const company = asString(payload.company) || "Unknown company";
    const role = asString(payload.role) || "Unknown role";
    const companyAssets = jobUrl
      ? await resolveCompanyAssetsFromJobUrl({ applyUrl: jobUrl, companyName: company }, { timeoutMs: 2500 })
      : { companyDomain: null, companyLogoUrl: null, companyLogoResolvedAt: null };
    let jobId = asString(payload.jobId) || null;
    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("active_resume_version_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    const activeResumeVersionId =
      typeof profile?.active_resume_version_id === "string" ? profile.active_resume_version_id : null;

    // Autofill records land here as "submitted" so the job shows in the tracker's "Applied"
    // column. We intentionally do NOT gate this on submission usage limits — capturing what the
    // user autofilled should always succeed.

    if (!jobId) {
      jobId = await findExistingJobId(supabase, auth.user.id, jobUrl);
    }

    if (jobId && writeClient && (companyAssets.companyDomain || companyAssets.companyLogoUrl)) {
      const jobPatch: Record<string, unknown> = {};
      if (companyAssets.companyDomain) jobPatch.company_domain = companyAssets.companyDomain;
      if (companyAssets.companyLogoUrl) {
        jobPatch.company_logo_url = companyAssets.companyLogoUrl;
        jobPatch.company_logo_resolved_at = companyAssets.companyLogoResolvedAt ?? new Date().toISOString();
      }
      const { error: logoUpdateError } = await writeClient.from("jobs").update(jobPatch).eq("id", jobId);
      if (logoUpdateError) console.error("extension job logo update failed", logoUpdateError);
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
            ...(companyAssets.companyDomain ? { company_domain: companyAssets.companyDomain } : {}),
            ...(companyAssets.companyLogoUrl
              ? {
                  company_logo_url: companyAssets.companyLogoUrl,
                  company_logo_resolved_at: companyAssets.companyLogoResolvedAt ?? new Date().toISOString(),
                }
              : {}),
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
      } else {
        jobId = job?.id ?? null;
      }
    }

    const existingApplication = jobId ? await findExistingApplication(supabase, auth.user.id, jobId) : null;
    // The canonicalized link is the dedup key: if this user already logged an
    // application for the same job URL, it's a duplicate. Company/title are scraped
    // from the page and too noisy to gate on without risking duplicate rows.
    const duplicate = Boolean(existingApplication?.id);
    const applicationRow = buildExtensionApplicationRow({
      userId: auth.user.id,
      jobId,
      payload,
      jobUrl,
      company,
      companyAssets,
      role,
      activeResumeVersionId,
      existingApplication,
    });

    const { data: application, error: applicationError } = await supabase
      .rpc("upsert_application_log", {
        p_user_id: applicationRow.user_id,
        p_job_id: applicationRow.job_id,
        p_status: applicationRow.status,
        p_apply_path: applicationRow.apply_path,
        p_resume_doc_id: applicationRow.resume_doc_id,
        p_cover_letter_doc_id: applicationRow.cover_letter_doc_id,
        p_field_map: applicationRow.field_map,
        p_screenshot_path: applicationRow.screenshot_path,
        p_failure_reason: applicationRow.failure_reason,
        p_base_version_id: applicationRow.base_version_id,
        p_resume_variant_id: applicationRow.resume_variant_id,
        p_tailoring_delta: applicationRow.tailoring_delta,
        p_rendered_pdf_path: applicationRow.rendered_pdf_path,
        p_submitted_at: applicationRow.submitted_at,
      })
      .single();
    if (applicationError) {
      console.error("extension application upsert failed", applicationError);
      return extensionError(`Could not sync the application: ${errorMessage(applicationError)}`, 500);
    }
    const savedApplication = application as { id: string; job_id: string | null } | null;

    return NextResponse.json({
      ok: true,
      applicationId: savedApplication?.id ?? null,
      jobId: savedApplication?.job_id ?? jobId,
      duplicate,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

// The extension's in-panel tracker: list the user's tracked applications.
export async function GET(request: Request) {
  try {
    const auth = await getExtensionAuthContext(request);
    const { data, error } = await auth.supabase
      .from("applications")
      .select(TRACKER_SELECT)
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("extension tracker list failed", error);
      return extensionError("Could not load your tracker.", 500);
    }
    const rows = Array.isArray(data) ? data : [];
    const items = rows.map((row) => toExtensionTrackerItem(row as Record<string, unknown>));
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return authErrorResponse(error);
  }
}

// Change an application's stage ("Mark as") and/or its note (max 300 chars).
export async function PATCH(request: Request) {
  try {
    const auth = await getExtensionAuthContext(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = asString(body?.id);
    if (!id) return extensionError("Missing application id.", 400);

    const patch: Record<string, unknown> = {};
    if (typeof body?.stage === "string") {
      patch.status = statusForTrackerStage(trackerStageFromInput(body.stage, "inbox"));
    }
    if (body && "notes" in body) {
      const trimmed = typeof body.notes === "string" ? body.notes.slice(0, 300).trim() : "";
      patch.notes = trimmed ? trimmed : null;
    }
    if (body && "resumeDocId" in body) {
      const resumeDocId = asString(body.resumeDocId);
      patch.resume_doc_id = resumeDocId ? resumeDocId : null;
    }
    if (Object.keys(patch).length === 0) {
      return extensionError("Nothing to update.", 400);
    }

    const { data, error } = await auth.supabase
      .from("applications")
      .update(patch)
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .select(TRACKER_SELECT)
      .maybeSingle();
    if (error) {
      console.error("extension tracker update failed", error);
      return extensionError(`Could not update the application: ${errorMessage(error)}`, 500);
    }
    const item = data ? toExtensionTrackerItem(data as Record<string, unknown>) : null;
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return authErrorResponse(error);
  }
}
