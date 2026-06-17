import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveCompanyAssetsFromJobUrl } from "@jobposted/shared";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  TRACKER_APPLICATION_SELECT,
  getTrackerPage,
  mapTrackerApplicationRow,
  type TrackerApplicationRow,
} from "@/lib/dashboard/tracker";
import {
  statusForTrackerStage,
  trackerStageFromInput,
  type ManualTrackerInput,
  type TrackerStage,
} from "@/lib/dashboard/tracker-model";

export const runtime = "nodejs";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeUrl(value: string) {
  if (!value) return "";
  try {
    return new URL(value).toString();
  } catch {
    return "";
  }
}

function sourceJobId(args: {
  source: "manual" | "job_board";
  userId: string;
  role: string;
  company: string;
  location: string;
  jobUrl: string;
  sourceJobId: string;
}) {
  const basis =
    args.source === "manual"
      ? args.jobUrl ||
        args.sourceJobId ||
        `${args.userId}:${args.company}:${args.role}:${args.location}`
      : `${args.userId}:${args.jobUrl || args.sourceJobId || `${args.company}:${args.role}:${args.location}`}`;
  return createHash("sha256")
    .update(`${args.source}:${basis.toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

function parsePayload(value: unknown): ManualTrackerInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const role = asString(record.role);
  const company = asString(record.company);
  const location = asString(record.location);
  const jobUrl = normalizeUrl(asString(record.jobUrl));
  const jobId = asString(record.jobId);
  const notes = asString(record.notes);
  const source = record.source === "job_board" ? "job_board" : "manual";
  const sourceJobId = asString(record.sourceJobId);
  const matchScore =
    typeof record.matchScore === "number" && Number.isFinite(record.matchScore)
      ? Math.max(0, Math.min(100, Math.round(record.matchScore)))
      : undefined;
  const stage = trackerStageFromInput(record.stage, "applied");

  if (!role || !company) return null;
  return { jobId, role, company, location, jobUrl, stage, notes, source, sourceJobId, matchScore };
}

function parseOptionalStage(value: unknown): TrackerStage | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase();
  if (!raw) return undefined;
  const parsed = trackerStageFromInput(raw, "applied");
  return parsed === "applied" && raw !== "applied" ? undefined : parsed;
}

type PatchPayload = {
  id: string;
  role?: string;
  company?: string;
  location?: string;
  jobUrl?: string;
  notes?: string;
  stage?: TrackerStage;
};

function parsePatchPayload(value: unknown): PatchPayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id);
  if (!id) return null;

  return {
    id,
    role: typeof record.role === "string" ? asString(record.role) : undefined,
    company: typeof record.company === "string" ? asString(record.company) : undefined,
    location: typeof record.location === "string" ? asString(record.location) : undefined,
    jobUrl: typeof record.jobUrl === "string" ? normalizeUrl(asString(record.jobUrl)) : undefined,
    notes: typeof record.notes === "string" ? asString(record.notes) : undefined,
    stage: parseOptionalStage(record.stage),
  };
}

function joinedJob(value: TrackerApplicationRow["jobs"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseIntParam(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

async function readTrackerItem(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  id: string,
) {
  const { data: row, error } = await client
    .from("applications")
    .select(TRACKER_APPLICATION_SELECT)
    .eq("id", id)
    .single();

  if (error || !row) return { item: null, row: null, error };
  return {
    item: mapTrackerApplicationRow(row as unknown as TrackerApplicationRow),
    row: row as unknown as TrackerApplicationRow,
    error: null,
  };
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, message: "Sign in to view the tracker." }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = await getTrackerPage({
    query: url.searchParams.get("query") ?? "",
    source: url.searchParams.get("source") ?? "all",
    stage: url.searchParams.get("stage") ?? "all",
    sort: url.searchParams.get("sort") ?? "recent",
    limit: parseIntParam(url.searchParams.get("limit")),
    offset: parseIntParam(url.searchParams.get("offset")),
  });

  return NextResponse.json({ ok: true, ...page });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, message: "Sign in to add a tracker item." }, { status: 401 });
  }

  const payload = parsePayload(await request.json().catch(() => null));
  if (!payload) {
    return NextResponse.json(
      { ok: false, message: "Role and company are required." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const writeClient = getServiceRoleClient();
  const client = writeClient ?? supabase;
  let jobId: string | null = payload.jobId ?? null;
  const companyAssets = payload.jobUrl
    ? await resolveCompanyAssetsFromJobUrl({ applyUrl: payload.jobUrl }, { timeoutMs: 2500 })
    : { companyDomain: null, companyLogoUrl: null, companyLogoResolvedAt: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_resume_version_id")
    .eq("id", user.id)
    .maybeSingle();
  const activeResumeVersionId =
    typeof profile?.active_resume_version_id === "string" ? profile.active_resume_version_id : null;

  if (jobId) {
    const { data: existingJob, error: existingJobError } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", jobId)
      .maybeSingle();

    if (existingJobError || !existingJob?.id) {
      jobId = null;
    }
  }

  if (jobId && writeClient && (companyAssets.companyDomain || companyAssets.companyLogoUrl)) {
    const jobPatch: Record<string, unknown> = {};
    if (companyAssets.companyDomain) jobPatch.company_domain = companyAssets.companyDomain;
    if (companyAssets.companyLogoUrl) {
      jobPatch.company_logo_url = companyAssets.companyLogoUrl;
      jobPatch.company_logo_resolved_at = companyAssets.companyLogoResolvedAt ?? now;
    }
    const { error: logoUpdateError } = await writeClient.from("jobs").update(jobPatch).eq("id", jobId);
    if (logoUpdateError) console.error("tracker job logo update failed", logoUpdateError);
  }

  if (!jobId && writeClient) {
    const { data: job, error: jobError } = await writeClient
      .from("jobs")
      .upsert(
        {
          source: payload.source ?? "manual",
          source_job_id: sourceJobId({
            source: payload.source ?? "manual",
            userId: user.id,
            role: payload.role,
            company: payload.company,
            location: payload.location ?? "",
            jobUrl: payload.jobUrl ?? "",
            sourceJobId: payload.sourceJobId ?? "",
          }),
          ats_type: "other",
          company: payload.company,
          ...(companyAssets.companyDomain ? { company_domain: companyAssets.companyDomain } : {}),
          ...(companyAssets.companyLogoUrl
            ? {
                company_logo_url: companyAssets.companyLogoUrl,
                company_logo_resolved_at: companyAssets.companyLogoResolvedAt ?? now,
              }
            : {}),
          title: payload.role,
          location: payload.location || null,
          remote: "unknown",
          description_md: null,
          apply_url: payload.jobUrl || null,
          form_questions: [],
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          visa_sponsorship: null,
          posted_at: null,
          last_seen_at: now,
          closed_at: null,
        },
        { onConflict: "source,source_job_id" },
      )
      .select("id")
      .single();

    if (jobError) {
      console.error("manual tracker job upsert failed", jobError);
      return NextResponse.json(
        { ok: false, message: "Could not create the job record." },
        { status: 500 },
      );
    }
    jobId = job?.id ?? null;
  }

  const applicationRow = {
    user_id: user.id,
    job_id: jobId,
    status: statusForTrackerStage(payload.stage),
    apply_path: payload.source ?? "manual",
    resume_doc_id: null,
    cover_letter_doc_id: null,
    field_map: {
      source: payload.source ?? "manual",
      matchScore: payload.matchScore ?? null,
      company: payload.company,
      companyDomain: companyAssets.companyDomain,
      companyLogoUrl: companyAssets.companyLogoUrl,
      role: payload.role,
      location: payload.location || null,
      jobUrl: payload.jobUrl || null,
      fieldsFilled: [],
      manual: {
        notes: payload.notes || null,
      },
    },
    screenshot_path: null,
    failure_reason: null,
    base_version_id: activeResumeVersionId,
    resume_variant_id: null,
    tailoring_delta: null,
    rendered_pdf_path: null,
    submitted_at: payload.stage === "inbox" ? null : now,
  };

  const { data: application, error: applicationError } = await client
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
    console.error("manual tracker application upsert failed", applicationError);
    return NextResponse.json(
      { ok: false, message: "Could not add that tracker item." },
      { status: 500 },
    );
  }
  const savedApplication = application as { id: string; job_id: string | null } | null;
  if (!savedApplication?.id) {
    return NextResponse.json(
      { ok: false, message: "Tracker item was saved, but could not be reloaded." },
      { status: 500 },
    );
  }

  const { data: row, error: readError } = await client
    .from("applications")
    .select(TRACKER_APPLICATION_SELECT)
    .eq("id", savedApplication.id)
    .single();

  if (readError || !row) {
    console.error("manual tracker application read failed", readError);
    return NextResponse.json(
      { ok: false, message: "Tracker item was saved, but could not be reloaded." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    item: mapTrackerApplicationRow(row as unknown as TrackerApplicationRow),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, message: "Sign in to update the tracker." }, { status: 401 });
  }

  const payload = parsePatchPayload(await request.json().catch(() => null));
  if (!payload) {
    return NextResponse.json(
      { ok: false, message: "Tracker item id is required." },
      { status: 400 },
    );
  }
  if (payload.role === "" || payload.company === "") {
    return NextResponse.json(
      { ok: false, message: "Role and company cannot be empty." },
      { status: 400 },
    );
  }

  const loaded = await readTrackerItem(supabase, payload.id);
  if (!loaded.row) {
    return NextResponse.json(
      { ok: false, message: "Tracker item was not found." },
      { status: 404 },
    );
  }

  const nextFieldMap = { ...asRecord(loaded.row.field_map) };
  const manual = { ...asRecord(nextFieldMap.manual) };
  const nextCompanyAssets = payload.jobUrl
    ? await resolveCompanyAssetsFromJobUrl({ applyUrl: payload.jobUrl }, { timeoutMs: 2500 })
    : null;
  if (payload.role !== undefined) nextFieldMap.role = payload.role;
  if (payload.company !== undefined) nextFieldMap.company = payload.company;
  if (payload.location !== undefined) nextFieldMap.location = payload.location || null;
  if (payload.jobUrl !== undefined) nextFieldMap.jobUrl = payload.jobUrl || null;
  if (nextCompanyAssets?.companyDomain) nextFieldMap.companyDomain = nextCompanyAssets.companyDomain;
  if (nextCompanyAssets?.companyLogoUrl) nextFieldMap.companyLogoUrl = nextCompanyAssets.companyLogoUrl;
  if (payload.notes !== undefined) manual.notes = payload.notes || null;
  nextFieldMap.manual = manual;

  const applicationUpdate: Record<string, unknown> = { field_map: nextFieldMap };
  if (payload.stage) {
    applicationUpdate.status = statusForTrackerStage(payload.stage);
    applicationUpdate.submitted_at =
      payload.stage === "inbox"
        ? null
        : loaded.row.submitted_at ?? new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from("applications")
    .update(applicationUpdate)
    .eq("id", payload.id);

  if (updateError) {
    console.error("tracker application update failed", updateError);
    return NextResponse.json(
      { ok: false, message: "Could not update that tracker item." },
      { status: 500 },
    );
  }

  const writeClient = getServiceRoleClient();
  const job = joinedJob(loaded.row.jobs);
  const jobCanBeEdited = job?.id && job.source === "manual";
  const jobUpdate: Record<string, unknown> = {};
  if (payload.role !== undefined) jobUpdate.title = payload.role;
  if (payload.company !== undefined) jobUpdate.company = payload.company;
  if (payload.location !== undefined) jobUpdate.location = payload.location || null;
  if (payload.jobUrl !== undefined) jobUpdate.apply_url = payload.jobUrl || null;
  if (nextCompanyAssets?.companyDomain) jobUpdate.company_domain = nextCompanyAssets.companyDomain;
  if (nextCompanyAssets?.companyLogoUrl) {
    jobUpdate.company_logo_url = nextCompanyAssets.companyLogoUrl;
    jobUpdate.company_logo_resolved_at = nextCompanyAssets.companyLogoResolvedAt ?? new Date().toISOString();
  }

  if (writeClient && job && jobCanBeEdited && Object.keys(jobUpdate).length > 0) {
    const { error: jobUpdateError } = await writeClient
      .from("jobs")
      .update(jobUpdate)
      .eq("id", job.id);
    if (jobUpdateError) {
      console.error("tracker job update failed", jobUpdateError);
    }
  }

  const reloaded = await readTrackerItem(supabase, payload.id);
  if (!reloaded.item) {
    return NextResponse.json(
      { ok: false, message: "Tracker item was updated, but could not be reloaded." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, item: reloaded.item });
}

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, message: "Sign in to delete tracker items." }, { status: 401 });
  }

  const url = new URL(request.url);
  let id = asString(url.searchParams.get("id"));
  if (!id) {
    const body = await request.json().catch(() => null);
    id = asString(asRecord(body).id);
  }
  if (!id) {
    return NextResponse.json(
      { ok: false, message: "Tracker item id is required." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("applications").delete().eq("id", id);
  if (error) {
    console.error("tracker application delete failed", error);
    return NextResponse.json(
      { ok: false, message: "Could not delete that tracker item." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
