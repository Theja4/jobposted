import { createClient } from "@supabase/supabase-js";
import type { MasterProfile, MasterProfileEducation, MasterProfileExperience, ReusableAnswer } from "./field-resolver.js";
import type { ApplicantProfile, ApplyJob, ResumeArtifact } from "./types.js";

/** Data access the runner needs. Interface so the orchestrator can be unit-tested with a fake. */
export interface RunnerDb {
  claim(batch: number): Promise<ApplyJob[]>;
  dailyLimitFor(userId: string): Promise<number>;
  countSubmittedToday(userId: string, now: Date): Promise<number>;
  loadApplicant(userId: string, baseVersionId: string | null): Promise<ApplicantProfile>;
  /** Full setup profile (identity, work auth, reusable screening answers) for form filling. */
  loadMasterProfile(userId: string, baseVersionId: string | null): Promise<MasterProfile>;
  resolveResume(job: ApplyJob): Promise<ResumeArtifact>;
  markSubmitted(id: string, screenshotPath: string | null): Promise<void>;
  markStatus(
    id: string,
    status: "queued" | "failed" | "ready_for_review",
    opts: { reason?: string | null; screenshotPath?: string | null; attempts?: number },
  ): Promise<void>;
  uploadScreenshot(userId: string, appId: string, bytes: Uint8Array): Promise<string | null>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any; storage: any };

const DEFAULT_DAILY_LIMIT = Number(process.env.APPLY_DAILY_LIMIT_DEFAULT ?? 20) || 20;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function strArr(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter(Boolean) : [];
}

function money(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function normalizeExperience(value: unknown): MasterProfileExperience[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const r = asRecord(item);
      return {
        title: str(r.title),
        company: str(r.company),
        location: str(r.location) || null,
        startDate: str(r.startDate) || null,
        endDate: str(r.endDate) || null,
        current: typeof r.current === "boolean" ? r.current : null,
        bullets: strArr(r.bullets),
      };
    })
    .filter((e) => e.title || e.company || e.bullets.length > 0);
}

function normalizeEducation(value: unknown): MasterProfileEducation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const r = asRecord(item);
      return {
        school: str(r.school),
        degree: str(r.degree) || null,
        field: str(r.field) || null,
        startDate: str(r.startDate) || null,
        endDate: str(r.endDate) || null,
      };
    })
    .filter((e) => e.school || e.degree);
}

function contentTypeFor(path: string): string {
  if (path.endsWith(".pdf")) return "application/pdf";
  if (path.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (path.endsWith(".doc")) return "application/msword";
  return "application/pdf";
}

export function createServiceClient(): Client | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "jobposted" },
  }) as unknown as Client;
}

export function createRunnerDb(client: Client): RunnerDb {
  return {
    async claim(batch) {
      const { data, error } = await client.rpc("claim_applications", { batch });
      if (error) throw new Error(`claim_failed: ${error.message}`);
      const rows = Array.isArray(data) ? data : [];
      return rows.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (row: any): ApplyJob => ({
          id: row.id,
          userId: row.user_id,
          jobId: row.job_id,
          fieldMap: asRecord(row.field_map),
          baseVersionId: row.base_version_id ?? null,
          resumeVariantId: row.resume_variant_id ?? null,
          renderedPdfPath: row.rendered_pdf_path ?? null,
          attempts: typeof row.attempts === "number" ? row.attempts : 1,
        }),
      );
    },

    async dailyLimitFor(userId) {
      const { data } = await client
        .from("subscriptions")
        .select("status,daily_limit")
        .eq("user_id", userId)
        .maybeSingle();
      const row = asRecord(data);
      const status = str(row.status);
      if (status && !ACTIVE_STATUSES.has(status)) return 0; // inactive sub → never auto-submit
      const limit = typeof row.daily_limit === "number" ? row.daily_limit : DEFAULT_DAILY_LIMIT;
      return Math.max(0, limit);
    },

    async countSubmittedToday(userId, now) {
      const dayStart = startOfUtcDay(now);
      const { count } = await client
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("apply_path", "server")
        .not("submitted_at", "is", null)
        .gte("submitted_at", dayStart.toISOString());
      return count ?? 0;
    },

    async loadApplicant(userId, baseVersionId) {
      const [{ data: profile }, { data: version }] = await Promise.all([
        client.from("profiles").select("*").eq("id", userId).maybeSingle(),
        baseVersionId
          ? client.from("resume_base_versions").select("content").eq("id", baseVersionId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const p = asRecord(profile);
      const content = asRecord(asRecord(version).content);
      const links = asRecord(content.links);
      const fullName = str(p.full_name) || str(content.name);
      const { first, last } = splitName(fullName);
      return {
        fullName,
        firstName: first,
        lastName: last,
        email: str(p.email) || str(content.email),
        phone: str(p.phone) || str(content.phone),
        location: str(p.location) || str(content.location),
        linkedin: str(p.linkedin_url) || str(links.linkedin),
        portfolio: str(p.portfolio_url) || str(links.portfolio),
        github: str(links.github),
      };
    },

    async loadMasterProfile(userId, baseVersionId) {
      const [{ data: profile }, { data: version }, { data: answersData }] = await Promise.all([
        client.from("profiles").select("*").eq("id", userId).maybeSingle(),
        baseVersionId
          ? client.from("resume_base_versions").select("content").eq("id", baseVersionId).maybeSingle()
          : Promise.resolve({ data: null }),
        client.from("profile_answers").select("key,prompt,value").eq("user_id", userId),
      ]);
      const p = asRecord(profile);
      const content = asRecord(asRecord(version).content);
      const links = asRecord(content.links);
      const fullName = str(p.full_name) || str(content.name);
      const { first, last } = splitName(fullName);
      const needsSponsorship = typeof p.needs_sponsorship === "boolean" ? p.needs_sponsorship : null;
      const workAuthorization = str(p.work_authorization);
      // We only assert "authorized to work" when the user actually supplied work-auth info.
      const authorizedToWork = workAuthorization || needsSponsorship !== null ? needsSponsorship === false : null;
      const answers: ReusableAnswer[] = (Array.isArray(answersData) ? answersData : [])
        .map((a) => {
          const r = asRecord(a);
          return { key: str(r.key), prompt: str(r.prompt), value: str(r.value) };
        })
        .filter((a) => a.key && a.value);
      const country = str(content.workAuthCountry) || str(p.location) || null;
      return {
        identity: {
          firstName: first,
          lastName: last,
          email: str(p.email) || str(content.email),
          phone: str(p.phone) || str(content.phone),
        },
        location: { city: str(p.location) || str(content.location) || null, country },
        links: {
          linkedin: str(p.linkedin_url) || str(links.linkedin) || null,
          github: str(links.github) || null,
          portfolio: str(p.portfolio_url) || str(links.portfolio) || null,
          website: [],
        },
        workAuth: { authorizedToWork, requiresSponsorship: needsSponsorship, country },
        compensation: {
          currentMin: money(p.current_salary_min),
          currentMax: money(p.current_salary_max),
          currentCurrency: str(p.current_salary_currency) || null,
          expectedMin: money(p.salary_expectation_min),
          expectedMax: money(p.salary_expectation_max),
          currency: str(p.salary_currency) || null,
        },
        // Demographics are deliberately empty on the server → "decline to self-identify" (never auto-filled).
        demographics: {},
        experience: normalizeExperience(content.experience),
        education: normalizeEducation(content.education),
        skills: strArr(content.skills),
        answers,
        documents: {},
      };
    },

    async resolveResume(job) {
      let path = job.renderedPdfPath ?? "";
      if (!path && job.baseVersionId) {
        const { data } = await client
          .from("resume_base_versions")
          .select("content")
          .eq("id", job.baseVersionId)
          .maybeSingle();
        const content = asRecord(asRecord(data).content);
        const sourceDoc = asRecord(content.sourceDocument);
        path = str(sourceDoc.storagePath);
      }
      if (!path) throw new Error("no_resume_artifact");

      const { data, error } = await client.storage.from("resumes").download(path);
      if (error || !data) throw new Error(`no_resume_artifact: ${error?.message ?? "download_failed"}`);
      const bytes = new Uint8Array(await (data as Blob).arrayBuffer());
      return {
        path,
        bytes,
        filename: path.split("/").pop() || "resume.pdf",
        contentType: contentTypeFor(path),
      };
    },

    async markSubmitted(id, screenshotPath) {
      await client
        .from("applications")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          failure_reason: null,
          screenshot_path: screenshotPath,
        })
        .eq("id", id);
    },

    async markStatus(id, status, opts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = { status };
      if (opts.reason !== undefined) patch.failure_reason = opts.reason;
      if (opts.screenshotPath !== undefined) patch.screenshot_path = opts.screenshotPath;
      if (opts.attempts !== undefined) patch.attempts = opts.attempts;
      await client.from("applications").update(patch).eq("id", id);
    },

    async uploadScreenshot(userId, appId, bytes) {
      const path = `${userId}/applications/${appId}.png`;
      const { error } = await client.storage
        .from("screenshots")
        .upload(path, bytes, { upsert: true, contentType: "image/png" });
      return error ? null : path;
    },
  };
}
