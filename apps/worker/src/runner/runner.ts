/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RunnerDb } from "./db.js";
import type { LaunchBrowser } from "./browser.js";
import type { Adapter, AdapterContext, ApplyJob } from "./types.js";
import { classifyFailure, decideAttempt, failureStatus } from "./policy.js";

export type RunnerDeps = {
  db: RunnerDb;
  launchBrowser: LaunchBrowser;
  pickAdapter: (platform: string, jobUrl: string) => Adapter | null;
  now?: () => Date;
  dryRun?: boolean;
  batch?: number;
  maxAttempts?: number;
  log?: (message: string) => void;
};

export type RunnerSummary = {
  claimed: number;
  submitted: number;
  skipped: number; // dry-run fills
  requeued: number; // transient / limit → back to queue
  review: number; // permanent → ready_for_review
  failed: number; // attempts exhausted
  dryRun: boolean;
  errors: Array<{ id: string; reason: string }>;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isExplicitFalse(value: unknown) {
  return value === false || (typeof value === "string" && value.trim().toLowerCase() === "false");
}

function requiresRenderedResume(job: ApplyJob) {
  return !isExplicitFalse(job.fieldMap.tailoringEnabled);
}

export async function runApplyBatch(deps: RunnerDeps): Promise<RunnerSummary> {
  const now = deps.now ?? (() => new Date());
  const dryRun = deps.dryRun ?? true;
  const batch = Math.max(1, Math.min(50, deps.batch ?? 10));
  const maxAttempts = Math.max(1, deps.maxAttempts ?? 3);
  const log = deps.log ?? (() => {});

  const summary: RunnerSummary = {
    claimed: 0,
    submitted: 0,
    skipped: 0,
    requeued: 0,
    review: 0,
    failed: 0,
    dryRun,
    errors: [],
  };

  const jobs = await deps.db.claim(batch);
  summary.claimed = jobs.length;
  if (jobs.length === 0) return summary;

  // Per-user quota cache for this run; increment locally as we submit.
  const quota = new Map<string, { limit: number; submitted: number }>();
  const getQuota = async (userId: string) => {
    let q = quota.get(userId);
    if (!q) {
      const [limit, submitted] = await Promise.all([
        deps.db.dailyLimitFor(userId),
        deps.db.countSubmittedToday(userId, now()),
      ]);
      q = { limit, submitted };
      quota.set(userId, q);
    }
    return q;
  };

  const browser = await deps.launchBrowser();
  try {
    for (const job of jobs) {
      try {
        await processJob(job);
      } catch (err) {
        // Unexpected error → transient, re-queue (or fail if exhausted).
        const reason = `runner_error: ${(err as Error).message}`;
        const status = failureStatus({ permanent: false, attempts: job.attempts, maxAttempts });
        await deps.db.markStatus(job.id, status, { reason });
        recordFailure(status);
        summary.errors.push({ id: job.id, reason });
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return summary;

  function recordFailure(status: "queued" | "failed" | "ready_for_review") {
    if (status === "queued") summary.requeued += 1;
    else if (status === "ready_for_review") summary.review += 1;
    else summary.failed += 1;
  }

  async function processJob(job: ApplyJob) {
    const jobUrl = asString(job.fieldMap.jobUrl);
    const platform = asString(job.fieldMap.platform);

    if (!jobUrl) {
      await deps.db.markStatus(job.id, "ready_for_review", { reason: "no_job_url" });
      summary.review += 1;
      return;
    }

    const adapter = deps.pickAdapter(platform, jobUrl);
    if (!adapter) {
      await deps.db.markStatus(job.id, "ready_for_review", { reason: `unsupported_ats: ${platform || "unknown"}` });
      summary.review += 1;
      return;
    }

    if (requiresRenderedResume(job) && !job.renderedPdfPath) {
      await deps.db.markStatus(job.id, "ready_for_review", {
        attempts: Math.max(0, job.attempts - 1),
        reason: "missing_tailored_resume_artifact",
      });
      summary.review += 1;
      return;
    }

    // Daily-limit / attempt gate.
    const q = await getQuota(job.userId);
    const decision = decideAttempt({
      todaySubmitted: q.submitted,
      dailyLimit: q.limit,
      attempts: job.attempts,
      maxAttempts,
    });
    if (!decision.proceed) {
      if (decision.release) {
        // Didn't actually attempt → give the attempt back so it isn't burned.
        await deps.db.markStatus(job.id, "queued", { attempts: Math.max(0, job.attempts - 1), reason: null });
        summary.requeued += 1;
      } else {
        await deps.db.markStatus(job.id, "failed", { reason: "too_many_attempts" });
        summary.failed += 1;
      }
      return;
    }

    // Resolve applicant + full setup profile + resume (missing resume is a permanent, review-worthy problem).
    const [applicant, masterProfile] = await Promise.all([
      deps.db.loadApplicant(job.userId, job.baseVersionId),
      deps.db.loadMasterProfile(job.userId, job.baseVersionId),
    ]);
    let resume;
    try {
      resume = await deps.db.resolveResume(job);
    } catch (err) {
      await deps.db.markStatus(job.id, "ready_for_review", { reason: (err as Error).message });
      summary.review += 1;
      return;
    }

    const ctx: AdapterContext = {
      job,
      jobUrl,
      applicant,
      masterProfile,
      demographicsEnabled: false, // server never auto-fills EEO/demographics
      resume,
      dryRun,
      log: (m) => log(`[${job.id}] ${m}`),
    };

    if (adapter.risk !== "server_safe") {
      await deps.db.markStatus(job.id, "ready_for_review", { reason: `adapter_not_server_safe:${adapter.id}` });
      summary.review += 1;
      return;
    }

    const page = await browser.newPage();
    try {
      const validation = await adapter.validate(page, ctx);
      if (!validation.ok) {
        const screenshotPath = validation.screenshot
          ? await deps.db.uploadScreenshot(job.userId, job.id, validation.screenshot)
          : null;
        const reason =
          validation.reason ??
          (validation.missingRequired.length > 0
            ? `adapter_validation_failed:${validation.missingRequired.join(",")}`
            : "adapter_validation_failed");
        await deps.db.markStatus(job.id, "ready_for_review", { reason, screenshotPath });
        summary.review += 1;
        summary.errors.push({ id: job.id, reason });
        return;
      }

      const outcome = await adapter.submit(page, ctx);

      const screenshotPath = outcome.screenshot
        ? await deps.db.uploadScreenshot(job.userId, job.id, outcome.screenshot)
        : null;

      if (outcome.status === "submitted") {
        await deps.db.markSubmitted(job.id, screenshotPath);
        q.submitted += 1;
        summary.submitted += 1;
        return;
      }

      if (outcome.status === "skipped") {
        // Dry-run preview: restore to the queue without consuming an attempt.
        await deps.db.markStatus(job.id, "queued", {
          attempts: Math.max(0, job.attempts - 1),
          reason: null,
          screenshotPath,
        });
        summary.skipped += 1;
        return;
      }

      // failed
      const permanent = outcome.permanent || classifyFailure(outcome.reason).permanent;
      const status = failureStatus({ permanent, attempts: job.attempts, maxAttempts });
      await deps.db.markStatus(job.id, status, { reason: outcome.reason, screenshotPath });
      recordFailure(status);
    } finally {
      await page.close?.().catch(() => {});
    }
  }
}
