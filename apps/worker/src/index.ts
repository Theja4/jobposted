import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { cronAuthorized, workerHealth } from "./health.js";
import { reportError } from "./observability.js";
import { createRunnerDb, createServiceClient } from "./runner/db.js";
import { launchPlaywright } from "./runner/browser.js";
import { pickAdapter } from "./runner/adapters.js";
import { runApplyBatch } from "./runner/runner.js";
import { validateAdapterTarget } from "./runner/validation.js";
import { cleanupTransientDocuments } from "./retention.js";

const port = Number(process.env.WORKER_PORT || process.env.PORT || 8080);

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function webBaseUrl() {
  return process.env.JOBPOSTED_WEB_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
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

async function readRequestJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("invalid_json");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function envInt(name: string, fallback: number) {
  const value = Number(process.env[name] ?? "");
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

/** Ask the web app to render PDFs for queued tailoring-enabled applications (between prepare and apply). */
async function triggerRender(baseUrl: string): Promise<unknown> {
  const target = new URL("/api/queue/render", baseUrl);
  const limit = envInt("QUEUE_RENDER_LIMIT", envInt("APPLY_BATCH", 10));
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

/** Build the apply runner from env and run one batch. Shared by /runner/run and /cron/run. */
async function runApplyFromEnv(): Promise<Record<string, unknown>> {
  if (process.env.APPLY_RUNNER_ENABLED !== "1") return { ok: false, disabled: true };
  const client = createServiceClient();
  if (!client) return { ok: false, error: "service_role_unavailable" };
  const summary = await runApplyBatch({
    db: createRunnerDb(client),
    launchBrowser: launchPlaywright,
    pickAdapter,
    // Dry-run is the default; only an explicit APPLY_DRY_RUN=0 submits live.
    dryRun: process.env.APPLY_DRY_RUN !== "0",
    batch: Number(process.env.APPLY_BATCH ?? 10) || 10,
    maxAttempts: Number(process.env.APPLY_MAX_ATTEMPTS ?? 3) || 3,
    log: (message) => console.info("[runner]", message),
  });
  return { ok: true, runner: summary };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/health") {
    const health = workerHealth();
    json(res, health.ok ? 200 : 503, health);
    return;
  }

  if (url.pathname === "/cron/run" && req.method === "POST") {
    if (!cronAuthorized(req.headers.authorization ?? null)) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const baseUrl = webBaseUrl();
    if (!baseUrl) {
      json(res, 503, {
        ok: false,
        error: "web_url_missing",
        message: "Set JOBPOSTED_WEB_URL or NEXT_PUBLIC_SITE_URL so the worker can prepare queues.",
      });
      return;
    }

    try {
      const target = new URL("/api/queue/prepare", baseUrl);
      const response = await fetch(target, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.WORKER_CRON_SECRET ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const body = await readJson(response);

      // Auto pipeline: prepare → render (web) → apply (local runner) → cleanup.
      let render: unknown = null;
      if (response.ok && process.env.QUEUE_RENDER_ON_CRON !== "0") {
        try {
          render = await triggerRender(baseUrl);
        } catch (error) {
          await reportError("worker render request failed", error, { path: url.pathname });
          render = { ok: false, error: "render_request_failed", message: error instanceof Error ? error.message : "render_request_failed" };
        }
      }

      let runner: unknown = null;
      if (response.ok && process.env.APPLY_RUNNER_ON_CRON !== "0") {
        try {
          runner = await runApplyFromEnv();
        } catch (error) {
          await reportError("worker apply runner failed", error, { path: url.pathname });
          runner = { ok: false, error: "runner_failed", message: error instanceof Error ? error.message : "runner_failed" };
        }
      }

      let cleanup: unknown = null;
      if (response.ok && process.env.DOCUMENT_CLEANUP_ON_CRON !== "0") {
        const client = createServiceClient();
        if (client) {
          try {
            cleanup = await cleanupTransientDocuments(client, {
              retentionDays: envInt("DOCUMENT_RETENTION_DAYS", 14),
              documentBatch: envInt("DOCUMENT_CLEANUP_BATCH", 500),
              storageScanLimit: envInt("DOCUMENT_CLEANUP_STORAGE_SCAN_LIMIT", 1_000),
              storageUserLimit: envInt("DOCUMENT_CLEANUP_STORAGE_USER_LIMIT", 1_000),
              log: (message) => console.info("[retention]", message),
            });
          } catch (error) {
            await reportError("document retention cleanup failed", error, { path: url.pathname });
            cleanup = {
              ok: false,
              error: "document_cleanup_failed",
              message: error instanceof Error ? error.message : "document_cleanup_failed",
            };
          }
        } else {
          cleanup = { ok: false, skipped: true, error: "service_role_unavailable" };
        }
      }
      json(res, response.ok ? 202 : 502, {
        ok: response.ok,
        accepted: response.ok,
        prepare: body,
        render,
        runner,
        cleanup,
        message: response.ok
          ? "Worker cron ran prepare → render → apply → cleanup (apply gated by APPLY_RUNNER_ENABLED/APPLY_DRY_RUN)."
          : "Web queue preparation failed.",
      });
    } catch (error) {
      await reportError("worker queue preparation request failed", error, { path: url.pathname });
      json(res, 502, {
        ok: false,
        error: "prepare_request_failed",
        message: error instanceof Error ? error.message : "prepare_request_failed",
      });
    }
    return;
  }

  if (url.pathname === "/cron/cleanup" && req.method === "POST") {
    if (!cronAuthorized(req.headers.authorization ?? null)) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const client = createServiceClient();
    if (!client) {
      json(res, 503, { ok: false, error: "service_role_unavailable" });
      return;
    }

    try {
      const cleanup = await cleanupTransientDocuments(client, {
        retentionDays: envInt("DOCUMENT_RETENTION_DAYS", 14),
        documentBatch: envInt("DOCUMENT_CLEANUP_BATCH", 500),
        storageScanLimit: envInt("DOCUMENT_CLEANUP_STORAGE_SCAN_LIMIT", 1_000),
        storageUserLimit: envInt("DOCUMENT_CLEANUP_STORAGE_USER_LIMIT", 1_000),
        log: (message) => console.info("[retention]", message),
      });
      json(res, 200, cleanup);
    } catch (error) {
      await reportError("document retention cleanup failed", error, { path: url.pathname });
      json(res, 500, {
        ok: false,
        error: "document_cleanup_failed",
        message: error instanceof Error ? error.message : "document_cleanup_failed",
      });
    }
    return;
  }

  if (url.pathname === "/runner/run" && req.method === "POST") {
    if (!cronAuthorized(req.headers.authorization ?? null)) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    try {
      const result = await runApplyFromEnv();
      if (result.disabled) {
        json(res, 503, { ok: false, error: "runner_disabled", message: "Set APPLY_RUNNER_ENABLED=1 to enable." });
        return;
      }
      if (result.error === "service_role_unavailable") {
        json(res, 503, result);
        return;
      }
      json(res, 200, result);
    } catch (error) {
      await reportError("apply runner failed", error, { path: url.pathname });
      json(res, 500, {
        ok: false,
        error: "runner_failed",
        message: error instanceof Error ? error.message : "runner_failed",
      });
    }
    return;
  }

  if (url.pathname === "/runner/validate" && req.method === "POST") {
    if (!cronAuthorized(req.headers.authorization ?? null)) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    let body: Record<string, unknown>;
    try {
      body = asRecord(await readRequestJson(req));
    } catch {
      json(res, 400, { ok: false, error: "invalid_json" });
      return;
    }

    const jobUrl = str(body.jobUrl);
    const platform = str(body.platform);
    if (!jobUrl) {
      json(res, 400, { ok: false, error: "job_url_required" });
      return;
    }

    try {
      const result = await validateAdapterTarget({ platform, jobUrl }, { log: (message) => console.info("[runner:validate]", message) });
      json(res, 200, { ok: result.ok, adapter: result.adapter, validation: result.validation, target: result.target });
    } catch (error) {
      await reportError("apply runner validation failed", error, { path: url.pathname, jobUrl, platform });
      json(res, 500, {
        ok: false,
        error: "validation_failed",
        message: error instanceof Error ? error.message : "validation_failed",
      });
    }
    return;
  }

  json(res, 404, { ok: false, error: "not_found" });
});

server.listen(port, () => {
  console.info(`[worker] listening on :${port}`);
});
