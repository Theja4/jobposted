import { runCleanupCron, runCronPipeline } from "./cron.js";
import { reportError } from "./observability.js";

function usage() {
  console.error("Usage: pnpm --filter @jobposted/worker run cron:run");
  console.error("       pnpm --filter @jobposted/worker run cron:cleanup");
}

async function main() {
  const command = process.argv[2] ?? "run";

  if (command !== "run" && command !== "cleanup") {
    usage();
    return 64;
  }

  const result = command === "cleanup" ? await runCleanupCron() : await runCronPipeline();
  console.info(JSON.stringify(result.body, null, 2));
  return result.status >= 400 ? 1 : 0;
}

main().then(
  (code) => {
    process.exit(code);
  },
  async (error: unknown) => {
    await reportError("worker cron cli failed", error, { command: process.argv[2] ?? "run" });
    process.exit(1);
  },
);
