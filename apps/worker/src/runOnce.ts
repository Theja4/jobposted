/**
 * Process a single queued application and exit (one tick of the main loop). Used for local
 * verification and manual reprocessing — `pnpm --filter @jobposted/worker once`.
 */
import { assertConfigured } from "./config";
import { initObservability, log } from "./logger";
import { claimApply, getJob, setStatus } from "./queue";
import { runApply } from "./applyRunner";
import { closeBrowser } from "./browser";

async function main() {
  assertConfigured();
  initObservability();
  const app = await claimApply();
  if (!app) {
    log.info("no queued application to process");
    process.exit(0);
  }
  const job = await getJob(app.job_id);
  if (!job) {
    await setStatus(app.id, "failed", { failure_reason: "job missing" });
    log.warn("job missing", { id: app.id });
  } else {
    try {
      await runApply(app, job);
    } catch (err) {
      log.error("apply run failed", err, { id: app.id });
      await setStatus(app.id, "failed", { failure_reason: (err as Error).message.slice(0, 300) });
    }
  }
  await closeBrowser();
  process.exit(0);
}

void main();
