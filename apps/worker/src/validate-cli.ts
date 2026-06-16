import { readFile } from "node:fs/promises";
import { validateAdapterTarget, validationTargetsFromUnknown, type ValidationTarget } from "./runner/validation.js";

type CliOptions = {
  targets: ValidationTarget[];
  file?: string;
  json: boolean;
  failOnIssue: boolean;
  screenshotDir?: string;
};

function usage() {
  return `Usage:
  pnpm --filter @jobposted/worker run validate:ats -- --url <job-url> [--platform greenhouse] [--label Acme]
  pnpm --filter @jobposted/worker run validate:ats -- --file ./ats-validation.json [--screenshots ./tmp/ats]

Options:
  --url <url>             Validate one live application URL.
  --platform <platform>   ATS hint, for example greenhouse, lever, ashby.
  --label <label>         Human label for reports and screenshots.
  --file <path>           JSON array or {"targets": [...]} with jobUrl/platform/label.
  --screenshots <dir>     Save failure screenshots to this directory.
  --json                  Print machine-readable JSON only.
  --no-fail               Exit 0 even when a target reports missing selectors/blockers.
  --help                  Show this message.`;
}

function readArg(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name}_value_required`);
  return value;
}

async function parseArgs(args: string[]): Promise<CliOptions> {
  const options: CliOptions = { targets: [], json: false, failOnIssue: true };
  let single: ValidationTarget = { jobUrl: "" };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.info(usage());
      process.exit(0);
    }
    if (arg === "--") continue;
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-fail") {
      options.failOnIssue = false;
      continue;
    }
    if (arg === "--url") {
      single = { ...single, jobUrl: readArg(args, index, "--url") };
      index += 1;
      continue;
    }
    if (arg === "--platform") {
      single = { ...single, platform: readArg(args, index, "--platform") };
      index += 1;
      continue;
    }
    if (arg === "--label") {
      single = { ...single, label: readArg(args, index, "--label") };
      index += 1;
      continue;
    }
    if (arg === "--file") {
      options.file = readArg(args, index, "--file");
      index += 1;
      continue;
    }
    if (arg === "--screenshots") {
      options.screenshotDir = readArg(args, index, "--screenshots");
      index += 1;
      continue;
    }
    throw new Error(`unknown_arg:${arg}`);
  }

  if (options.file) {
    const parsed = JSON.parse(await readFile(options.file, "utf8")) as unknown;
    options.targets.push(...validationTargetsFromUnknown(parsed));
  }
  if (single.jobUrl) options.targets.push(single);
  if (!options.targets.length) throw new Error("validation_target_required");
  return options;
}

function summarize(result: Awaited<ReturnType<typeof validateAdapterTarget>>) {
  const status = result.validation.ok ? "PASS" : "FAIL";
  const adapter = result.adapter ? `${result.adapter.id} (${result.adapter.risk})` : "unsupported";
  const reason = result.validation.reason ? `, ${result.validation.reason}` : "";
  const missing = result.validation.missingRequired.length ? `, missing: ${result.validation.missingRequired.join(", ")}` : "";
  const screenshot = result.validation.screenshotPath ? `, screenshot: ${result.validation.screenshotPath}` : "";
  return `${status} ${result.target.label} -> ${adapter}, confidence ${result.validation.confidence}${reason}${missing}${screenshot}`;
}

async function main() {
  const options = await parseArgs(process.argv.slice(2));
  const results = [];
  for (const target of options.targets) {
    const result = await validateAdapterTarget(target, {
      screenshotDir: options.screenshotDir,
      log: (message) => {
        if (!options.json) console.info(`[validate:ats] ${message}`);
      },
    });
    results.push(result);
    if (!options.json) console.info(summarize(result));
  }

  if (options.json) console.info(JSON.stringify({ ok: results.every((r) => r.validation.ok), results }, null, 2));
  if (options.failOnIssue && results.some((result) => !result.validation.ok)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage());
  process.exitCode = 1;
});
