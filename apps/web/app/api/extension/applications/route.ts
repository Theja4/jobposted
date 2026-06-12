import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { ExtensionApplicationUpsert } from "@jobposted/shared";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";

export const runtime = "nodejs";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sourceJobId(jobUrl: string) {
  return createHash("sha256").update(jobUrl).digest("hex").slice(0, 32);
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
    const jobUrl = asString(payload.jobUrl);
    const company = asString(payload.company) || "Unknown company";
    const role = asString(payload.role) || "Unknown role";
    let jobId = asString(payload.jobId) || null;

    if (!jobId && writeClient) {
      const { data: job, error: jobError } = await writeClient
        .from("jobs")
        .upsert(
          {
            source: "extension",
            source_job_id: sourceJobId(jobUrl),
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

    const applicationRow = {
      user_id: auth.user.id,
      job_id: jobId,
      status: payload.status,
      apply_path: "extension",
      resume_doc_id: null,
      cover_letter_doc_id: null,
      field_map: {
        source: "extension",
        platform: payload.platform,
        company,
        role,
        jobUrl,
        resumeUsed: payload.resumeUsed ?? null,
        genericResumeUsed: Boolean(payload.genericResumeUsed),
        fieldsFilled: payload.fieldsFilled,
      },
      screenshot_path: payload.screenshotUrl ?? null,
      failure_reason: null,
      base_version_id: null,
      resume_variant_id: null,
      tailoring_delta: payload.genericResumeUsed ? { genericResumeUsed: true } : null,
      rendered_pdf_path: payload.resumeUsed ?? null,
      submitted_at: payload.appliedAt,
    };

    const query = jobId
      ? supabase
          .from("applications")
          .upsert(applicationRow, { onConflict: "user_id,job_id" })
          .select("id,job_id")
          .single()
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
