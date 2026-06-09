import { assertConfigured, config } from "./config";
import { initObservability, log } from "./logger";
import { claimApply, claimSubmit, getJob, setStatus } from "./queue";
import { runApply } from "./applyRunner";
import { runSubmit } from "./submitRunner";
import { closeBrowser } from "./browser";

let running = true;

/** One pass: claim+process one fill and one submit (single-flight; concurrency reserved). */
async function tick(): Promise<boolean> {
  const app = await claimApply();
  if (app) {
    const job = await getJob(app.job_id);
    if (!job) {
      await setStatus(app.id, "failed", { failure_reason: "job missing" });
    } else {
      try {
        await runApply(app, job);
      } catch (err) {
        log.error("apply run failed", err, { id: app.id });
        await setStatus(app.id, "failed", {
          failure_reason: (err as Error).message.slice(0, 300),
        });
      }
    }
  }

  const sub = await claimSubmit();
  if (sub) {
    const job = await getJob(sub.job_id);
    if (job) {
      try {
        await runSubmit(sub, job);
      } catch (err) {
        log.error("submit run failed", err, { id: sub.id });
        await setStatus(sub.id, "failed", {
          failure_reason: (err as Error).message.slice(0, 300),
        });
      }
    }
  }

  return Boolean(app || sub);
}

async function main() {
  assertConfigured();
  initObservability();
  log.info("apply worker started", { pollMs: config.pollMs, headless: config.headless });

  const shutdown = async () => {
    log.info("shutting down");
    running = false;
    await closeBrowser();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (running) {
    const did = await tick().catch((err) => {
      log.error("tick error", err);
      return false;
    });
    await new Promise((r) => setTimeout(r, did ? 250 : config.pollMs));
  }
}

void main();
