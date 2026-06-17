import { reportError } from "./observability.js";
import { launchPlaywright } from "./runner/browser.js";
import { pickAdapter } from "./runner/adapters.js";
import { createRunnerDb, createServiceClient, type ServiceClient } from "./runner/db.js";
import { runApplyBatch } from "./runner/runner.js";
import { cleanupTransientDocuments } from "./retention.js";

export type WorkerCronResult = {
  status: number;
  body: Record<string, unknown>;
};

function webBaseUrl() {
  return process.env.JOBPOSTED_WEB_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function envInt(name: string, fallback: number) {
  const value = Number(process.env[name] ?? "");
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function workerHolder() {
  return `${process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_DEPLOYMENT_ID || "local"}:${process.pid}:${Date.now()}`;
}

async function acquireWorkerLock(client: ServiceClient, lockName: string, holder: string, ttlSeconds: number) {
  const { data, error } = await client.rpc("acquire_worker_lock", {
    p_lock_name: lockName,
    p_holder: holder,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) throw new Error(`worker_lock_failed: ${error.message}`);
  return data === true;
}

async function releaseWorkerLock(client: ServiceClient, lockName: string, holder: string) {
  const { error } = await client.rpc("release_worker_lock", {
    p_lock_name: lockName,
    p_holder: holder,
  });
  if (error) await reportError("worker lock release failed", error, { lockName });
}

async function withWorkerLock<T>(
  client: ServiceClient,
  lockName: string,
  ttlSeconds: number,
  onLocked: () => T,
  fn: () => Promise<T>,
) {
  if (process.env.WORKER_LOCKS_ENABLED === "0") return fn();
  const holder = workerHolder();
  const acquired = await acquireWorkerLock(client, lockName, holder, ttlSeconds);
  if (!acquired) return onLocked();
  try {
    return await fn();
  } finally {
    await releaseWorkerLock(client, lockName, holder);
  }
}

async function triggerPrepare(baseUrl: string) {
  const target = new URL("/api/queue/prepare", baseUrl);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.WORKER_CRON_SECRET ?? ""}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  return { response, body: await readJson(response) };
}

/** Ask the web app to render PDFs for queued tailoring-enabled applications between prepare and apply. */
async function triggerRender(baseUrl: string): Promise<unknown> {
  const target = new URL("/api/queue/render", baseUrl);
  const limit = envInt("QUEUE_RENDER_LIMIT", envInt("APPLY_BATCH", 50));
  const response = await fetch(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.WORKER_CRON_SECRET ?? ""}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ limit }),
  });
  return readJson(response);
}

/** Build the apply runner from env and run one batch. Shared by /runner/run, /cron/run, and Railway cron. */
export async function runApplyFromEnv(): Promise<Record<string, unknown>> {
  if (process.env.APPLY_RUNNER_ENABLED !== "1") return { ok: false, disabled: true };
  const client = createServiceClient();
  if (!client) return { ok: false, error: "service_role_unavailable" };
  return withWorkerLock<Record<string, unknown>>(
    client,
    "apply-runner",
    envInt("APPLY_RUNNER_LOCK_TTL_SECONDS", 15 * 60),
    () => ({ ok: false, skipped: true, error: "runner_lock_held" }),
    async () => {
      const summary = await runApplyBatch({
        db: createRunnerDb(client),
        launchBrowser: launchPlaywright,
        pickAdapter,
        // Dry-run is the default; only an explicit APPLY_DRY_RUN=0 submits live.
        dryRun: process.env.APPLY_DRY_RUN !== "0",
        batch: Number(process.env.APPLY_BATCH ?? 50) || 50,
        maxAttempts: Number(process.env.APPLY_MAX_ATTEMPTS ?? 3) || 3,
        log: (message) => console.info("[runner]", message),
      });
      return { ok: true, runner: summary };
    },
  );
}

async function runCleanupFromEnv(): Promise<unknown> {
  const client = createServiceClient();
  if (!client) return { ok: false, skipped: true, error: "service_role_unavailable" };

  return cleanupTransientDocuments(client, {
    retentionDays: envInt("DOCUMENT_RETENTION_DAYS", 14),
    documentBatch: envInt("DOCUMENT_CLEANUP_BATCH", 500),
    storageScanLimit: envInt("DOCUMENT_CLEANUP_STORAGE_SCAN_LIMIT", 1_000),
    storageUserLimit: envInt("DOCUMENT_CLEANUP_STORAGE_USER_LIMIT", 1_000),
    log: (message) => console.info("[retention]", message),
  });
}

export async function runCleanupCron(): Promise<WorkerCronResult> {
  try {
    const cleanup = await runCleanupFromEnv();
    const cleanupRecord = asRecord(cleanup);
    return {
      status: cleanupRecord.error === "service_role_unavailable" ? 503 : 200,
      body: cleanupRecord,
    };
  } catch (error) {
    await reportError("document retention cleanup failed", error, { source: "worker-cron" });
    return {
      status: 500,
      body: {
        ok: false,
        error: "document_cleanup_failed",
        message: error instanceof Error ? error.message : "document_cleanup_failed",
      },
    };
  }
}

export async function runCronPipeline(): Promise<WorkerCronResult> {
  const baseUrl = webBaseUrl();
  if (!baseUrl) {
    return {
      status: 503,
      body: {
        ok: false,
        error: "web_url_missing",
        message: "Set JOBPOSTED_WEB_URL or NEXT_PUBLIC_SITE_URL so the worker can prepare queues.",
      },
    };
  }

  const lockClient = createServiceClient();
  const run = async (): Promise<WorkerCronResult> => {
    const { response, body } = await triggerPrepare(baseUrl);

    let render: unknown = null;
    if (response.ok && process.env.QUEUE_RENDER_ON_CRON !== "0") {
      try {
        render = await triggerRender(baseUrl);
      } catch (error) {
        await reportError("worker render request failed", error, { source: "worker-cron" });
        render = {
          ok: false,
          error: "render_request_failed",
          message: error instanceof Error ? error.message : "render_request_failed",
        };
      }
    }

    let runner: unknown = null;
    if (response.ok && process.env.APPLY_RUNNER_ON_CRON !== "0") {
      try {
        runner = await runApplyFromEnv();
      } catch (error) {
        await reportError("worker apply runner failed", error, { source: "worker-cron" });
        runner = {
          ok: false,
          error: "runner_failed",
          message: error instanceof Error ? error.message : "runner_failed",
        };
      }
    }

    let cleanup: unknown = null;
    if (response.ok && process.env.DOCUMENT_CLEANUP_ON_CRON !== "0") {
      try {
        cleanup = await runCleanupFromEnv();
      } catch (error) {
        await reportError("document retention cleanup failed", error, { source: "worker-cron" });
        cleanup = {
          ok: false,
          error: "document_cleanup_failed",
          message: error instanceof Error ? error.message : "document_cleanup_failed",
        };
      }
    }

    return {
      status: response.ok ? 202 : 502,
      body: {
        ok: response.ok,
        accepted: response.ok,
        prepare: body,
        render,
        runner,
        cleanup,
        message: response.ok
          ? "Worker cron ran prepare -> render -> apply -> cleanup (apply gated by APPLY_RUNNER_ENABLED/APPLY_DRY_RUN)."
          : "Web queue preparation failed.",
      },
    };
  };

  try {
    if (!lockClient) return run();
    return await withWorkerLock(
      lockClient,
      "cron-pipeline",
      envInt("WORKER_CRON_LOCK_TTL_SECONDS", 30 * 60),
      () => ({
        status: 202,
        body: { ok: true, skipped: true, error: "cron_lock_held", message: "Another worker cron run is already active." },
      }),
      run,
    );
  } catch (error) {
    await reportError("worker queue preparation request failed", error, { source: "worker-cron" });
    return {
      status: 502,
      body: {
        ok: false,
        error: "prepare_request_failed",
        message: error instanceof Error ? error.message : "prepare_request_failed",
      },
    };
  }
}
