import { describe, expect, it, vi } from "vitest";
import type { RunnerDb } from "./db.js";
import type { LaunchBrowser } from "./browser.js";
import type { Adapter, AdapterValidation, ApplyJob, SubmitOutcome } from "./types.js";
import { computeUsageStatus, type UsageStatus } from "./usage.js";
import { runApplyBatch } from "./runner.js";

function job(overrides: Partial<ApplyJob> = {}): ApplyJob {
  return {
    id: "app_1",
    userId: "user_1",
    jobId: "job_1",
    fieldMap: { jobUrl: "https://boards.greenhouse.io/acme/jobs/1", platform: "greenhouse" },
    baseVersionId: "base_1",
    resumeVariantId: null,
    renderedPdfPath: "user_1/applications/app_1.pdf",
    attempts: 1,
    ...overrides,
  };
}

type Update = { id: string; status: string; reason?: string | null; attempts?: number; screenshotPath?: string | null };

function fakeDb(
  jobs: ApplyJob[],
  opts: { usage?: UsageStatus; limit?: number; submitted?: number; totalSubmitted?: number; resumeThrows?: boolean } = {},
) {
  const updates: Update[] = [];
  const db: RunnerDb = {
    async claim() {
      return jobs;
    },
    async usageFor() {
      return (
        opts.usage ??
        computeUsageStatus({
          subscription: { plan: "jobposted_20", status: "active", dailyLimit: opts.limit ?? 20 },
          todaySubmitted: opts.submitted ?? 0,
          totalSubmitted: opts.totalSubmitted ?? opts.submitted ?? 0,
        })
      );
    },
    async loadApplicant() {
      return {
        fullName: "Jane Doe",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "",
        location: "",
        linkedin: "",
        portfolio: "",
        github: "",
      };
    },
    async loadMasterProfile() {
      return {
        identity: { firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "" },
        location: {},
        links: { website: [] },
        workAuth: { authorizedToWork: true, requiresSponsorship: false },
        demographics: {},
        experience: [],
        education: [],
        skills: [],
        answers: [],
        documents: {},
      };
    },
    async resolveResume() {
      if (opts.resumeThrows) throw new Error("no_resume_artifact");
      return { path: "user_1/base/x.pdf", bytes: new Uint8Array([1]), filename: "x.pdf", contentType: "application/pdf" };
    },
    async markSubmitted(id, screenshotPath) {
      updates.push({ id, status: "submitted", screenshotPath });
    },
    async markStatus(id, status, o) {
      updates.push({ id, status, reason: o.reason, attempts: o.attempts, screenshotPath: o.screenshotPath });
    },
    async uploadScreenshot() {
      return "user_1/applications/app_1.png";
    },
  };
  return { db, updates };
}

const browser: LaunchBrowser = async () => ({
  async newPage() {
    return { close: async () => {} };
  },
  async close() {},
});

function okValidation(): AdapterValidation {
  return {
    ok: true,
    confidence: 1,
    blocker: null,
    reason: null,
    requiredFields: ["applicant_name", "email", "resume", "submit"],
    missingRequired: [],
    submitFound: true,
    resumeInputFound: true,
    screenshot: null,
  };
}

function adapterReturning(
  outcome: SubmitOutcome,
  spy?: () => void,
  opts: { validation?: AdapterValidation; risk?: Adapter["risk"] } = {},
): (p: string, u: string) => Adapter | null {
  const adapter: Adapter = {
    id: "fake",
    version: "test",
    risk: opts.risk ?? "server_safe",
    matches: () => true,
    async validate() {
      return opts.validation ?? okValidation();
    },
    async submit() {
      spy?.();
      return outcome;
    },
  };
  return () => adapter;
}

describe("runApplyBatch", () => {
  it("dry-run fills then restores to queue without burning an attempt", async () => {
    const { db, updates } = fakeDb([job({ attempts: 1 })]);
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "skipped", reason: "dry_run" }),
      dryRun: true,
    });
    expect(summary.skipped).toBe(1);
    expect(summary.submitted).toBe(0);
    expect(updates[0]).toMatchObject({ id: "app_1", status: "queued", attempts: 0 });
  });

  it("live submit marks submitted and stores a screenshot", async () => {
    const { db, updates } = fakeDb([job()]);
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "submitted", screenshot: new Uint8Array([1]) }),
      dryRun: false,
    });
    expect(summary.submitted).toBe(1);
    expect(updates[0]).toMatchObject({ id: "app_1", status: "submitted", screenshotPath: "user_1/applications/app_1.png" });
  });

  it("routes unsupported ATS to review without opening the form", async () => {
    const submit = vi.fn();
    const { db, updates } = fakeDb([job()]);
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: () => null,
      dryRun: false,
    });
    expect(summary.review).toBe(1);
    expect(submit).not.toHaveBeenCalled();
    expect(updates[0]?.status).toBe("ready_for_review");
    expect(updates[0]?.reason).toContain("unsupported_ats");
  });

  it("releases (without burning an attempt) when the daily limit is reached", async () => {
    const submit = vi.fn();
    const { db, updates } = fakeDb([job({ attempts: 1 })], { limit: 20, submitted: 20 });
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "submitted" }, submit),
      dryRun: false,
    });
    expect(summary.requeued).toBe(1);
    expect(submit).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("routes free users to review before submit", async () => {
    const submit = vi.fn();
    const { db, updates } = fakeDb([job({ attempts: 1 })], {
      usage: computeUsageStatus({
        subscription: null,
        totalSubmitted: 0,
        todaySubmitted: 0,
      }),
    });
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "submitted" }, submit),
      dryRun: false,
    });
    expect(summary.review).toBe(1);
    expect(submit).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: "ready_for_review", reason: "subscription_inactive", attempts: 0 });
  });

  it("sends permanent failures to review", async () => {
    const { db, updates } = fakeDb([job()]);
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "failed", reason: "form_not_found", permanent: true }),
      dryRun: false,
    });
    expect(summary.review).toBe(1);
    expect(updates[0]?.status).toBe("ready_for_review");
  });

  it("routes adapter validation failures to review before submit", async () => {
    const submit = vi.fn();
    const { db, updates } = fakeDb([job()]);
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: adapterReturning(
        { status: "submitted" },
        submit,
        {
          validation: {
            ...okValidation(),
            ok: false,
            confidence: 0,
            blocker: "captcha_required",
            reason: "captcha_required",
            missingRequired: ["form"],
            submitFound: false,
            resumeInputFound: false,
            screenshot: new Uint8Array([1]),
          },
        },
      ),
      dryRun: false,
    });
    expect(summary.review).toBe(1);
    expect(submit).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({
      id: "app_1",
      status: "ready_for_review",
      reason: "captcha_required",
      screenshotPath: "user_1/applications/app_1.png",
    });
  });

  it("routes known but review-only adapters to review before validation or submit", async () => {
    const submit = vi.fn();
    const { db, updates } = fakeDb([job({ fieldMap: { jobUrl: "https://www.linkedin.com/jobs/view/1", platform: "linkedin" } })]);
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "submitted" }, submit, { risk: "review_only" }),
      dryRun: false,
    });
    expect(summary.review).toBe(1);
    expect(submit).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: "ready_for_review", reason: "adapter_not_server_safe:fake" });
  });

  it("re-queues a transient failure with attempts left, fails it once exhausted", async () => {
    const retry = fakeDb([job({ attempts: 1 })]);
    const s1 = await runApplyBatch({
      db: retry.db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "failed", reason: "confirmation_timeout", permanent: false }),
      dryRun: false,
      maxAttempts: 3,
    });
    expect(s1.requeued).toBe(1);
    expect(retry.updates[0]?.status).toBe("queued");

    const exhausted = fakeDb([job({ attempts: 3 })]);
    const s2 = await runApplyBatch({
      db: exhausted.db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "failed", reason: "confirmation_timeout", permanent: false }),
      dryRun: false,
      maxAttempts: 3,
    });
    expect(s2.failed).toBe(1);
    expect(exhausted.updates[0]?.status).toBe("failed");
  });

  it("routes a missing resume to review", async () => {
    const { db, updates } = fakeDb([job()], { resumeThrows: true });
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "submitted" }),
      dryRun: false,
    });
    expect(summary.review).toBe(1);
    expect(updates[0]?.reason).toContain("no_resume_artifact");
  });

  it("requeues tailoring-enabled jobs without rendered artifacts before submit", async () => {
    const submit = vi.fn();
    const { db, updates } = fakeDb([job({ renderedPdfPath: null, attempts: 1 })]);
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "submitted" }, submit),
      dryRun: false,
    });
    expect(summary.requeued).toBe(1);
    expect(submit).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({
      status: "queued",
      reason: "waiting_for_tailored_resume",
      attempts: 0,
    });
  });

  it("allows explicitly non-tailored jobs to proceed without a rendered artifact", async () => {
    const { db, updates } = fakeDb([
      job({
        renderedPdfPath: null,
        fieldMap: {
          jobUrl: "https://boards.greenhouse.io/acme/jobs/1",
          platform: "greenhouse",
          tailoringEnabled: false,
        },
      }),
    ]);
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "submitted" }),
      dryRun: false,
    });
    expect(summary.submitted).toBe(1);
    expect(updates[0]?.status).toBe("submitted");
  });

  it("routes a job with no apply URL to review", async () => {
    const { db, updates } = fakeDb([job({ fieldMap: { platform: "greenhouse" } })]);
    const summary = await runApplyBatch({
      db,
      launchBrowser: browser,
      pickAdapter: adapterReturning({ status: "submitted" }),
      dryRun: false,
    });
    expect(summary.review).toBe(1);
    expect(updates[0]?.reason).toBe("no_job_url");
  });
});
