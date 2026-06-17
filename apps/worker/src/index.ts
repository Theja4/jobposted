import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { runApplyFromEnv, runCleanupCron, runCronPipeline } from "./cron.js";
import { cronAuthorized, workerHealth } from "./health.js";
import { reportError } from "./observability.js";
import { validateAdapterTarget } from "./runner/validation.js";

const port = Number(process.env.WORKER_PORT || process.env.PORT || 8080);

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
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

    const result = await runCronPipeline();
    json(res, result.status, result.body);
    return;
  }

  if (url.pathname === "/cron/cleanup" && req.method === "POST") {
    if (!cronAuthorized(req.headers.authorization ?? null)) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const result = await runCleanupCron();
    json(res, result.status, result.body);
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
