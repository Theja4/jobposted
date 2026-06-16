import type { ExtensionApplicationUpsert } from "@jobposted/shared";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export type ExistingExtensionApplicationRow = {
  id: string;
  job_id: string | null;
  status: string | null;
  resume_doc_id: string | null;
  cover_letter_doc_id: string | null;
  field_map: unknown;
  screenshot_path: string | null;
  base_version_id: string | null;
  resume_variant_id: string | null;
  tailoring_delta: unknown;
  rendered_pdf_path: string | null;
  submitted_at: string | null;
};

export function buildExtensionApplicationRow(args: {
  userId: string;
  jobId: string | null;
  payload: ExtensionApplicationUpsert;
  jobUrl: string;
  company: string;
  role: string;
  activeResumeVersionId: string | null;
  existingApplication: ExistingExtensionApplicationRow | null;
}) {
  const {
    userId,
    jobId,
    payload,
    jobUrl,
    company,
    role,
    activeResumeVersionId,
    existingApplication,
  } = args;
  const existingFieldMap = asRecord(existingApplication?.field_map);
  const payloadResumeUsed = asString(payload.resumeUsed) || null;
  const existingResumeUsed = asString(existingFieldMap.resumeUsed) || existingApplication?.rendered_pdf_path || null;
  const resumeUsed = payloadResumeUsed ?? existingResumeUsed;
  const genericResumeUsed =
    typeof payload.genericResumeUsed === "boolean"
      ? payload.genericResumeUsed
      : Boolean(existingFieldMap.genericResumeUsed);

  return {
    user_id: userId,
    job_id: jobId,
    status: existingApplication?.status === "submitted" && payload.status === "filled" ? "submitted" : payload.status,
    apply_path: "extension",
    resume_doc_id: existingApplication?.resume_doc_id ?? null,
    cover_letter_doc_id: existingApplication?.cover_letter_doc_id ?? null,
    field_map: {
      ...existingFieldMap,
      source: "extension",
      platform: payload.platform,
      company,
      role,
      jobUrl,
      resumeUsed,
      genericResumeUsed,
      fieldsFilled: payload.fieldsFilled,
    },
    screenshot_path: payload.screenshotUrl ?? existingApplication?.screenshot_path ?? null,
    failure_reason: null,
    base_version_id: existingApplication?.base_version_id ?? activeResumeVersionId,
    resume_variant_id: existingApplication?.resume_variant_id ?? null,
    tailoring_delta: payload.genericResumeUsed ? { genericResumeUsed: true } : existingApplication?.tailoring_delta ?? null,
    rendered_pdf_path: payloadResumeUsed ?? existingApplication?.rendered_pdf_path ?? null,
    submitted_at: payload.status === "submitted" ? payload.appliedAt : existingApplication?.submitted_at ?? null,
  };
}
