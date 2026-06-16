import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchPlaywright, type LaunchBrowser } from "./browser.js";
import { pickAdapter } from "./adapters.js";
import type { AdapterContext, AdapterValidation, ApplyJob } from "./types.js";

export type ValidationTarget = {
  label?: string;
  platform?: string;
  jobUrl: string;
};

export type SafeValidation = Omit<AdapterValidation, "screenshot"> & {
  screenshotBytes: number;
  screenshotPath?: string | null;
};

export type AdapterValidationResult = {
  ok: boolean;
  target: Required<ValidationTarget>;
  adapter: { id: string; version: string; risk: string } | null;
  validation: SafeValidation;
};

export type AdapterValidationOptions = {
  launchBrowser?: LaunchBrowser;
  screenshotDir?: string | null;
  log?: (message: string) => void;
};

function validationOnlyJob(jobUrl: string, platform: string): ApplyJob {
  return {
    id: "validation_only",
    userId: "validation_only",
    jobId: "validation_only",
    fieldMap: { jobUrl, platform },
    baseVersionId: null,
    resumeVariantId: null,
    renderedPdfPath: null,
    attempts: 1,
  };
}

export function validationContextFor(target: ValidationTarget): AdapterContext {
  const platform = target.platform ?? "";
  return {
    job: validationOnlyJob(target.jobUrl, platform),
    jobUrl: target.jobUrl,
    applicant: {
      fullName: "Validation User",
      firstName: "Validation",
      lastName: "User",
      email: "validation@example.com",
      phone: "",
      location: "",
      linkedin: "",
      portfolio: "",
      github: "",
    },
    resume: {
      path: "validation-only.pdf",
      bytes: new Uint8Array(),
      filename: "validation-only.pdf",
      contentType: "application/pdf",
    },
    dryRun: true,
    log: (message) => console.info("[runner:validate]", message),
  };
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "target";
}

function hostOrValue(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

async function normalizeValidation(
  validation: AdapterValidation,
  target: Required<ValidationTarget>,
  screenshotDir: string | null | undefined,
): Promise<SafeValidation> {
  const { screenshot, ...safeValidation } = validation;
  let screenshotPath: string | null = null;
  if (screenshot?.byteLength && screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    const filename = `${safeName(target.platform)}-${safeName(target.label || hostOrValue(target.jobUrl))}.png`;
    screenshotPath = path.join(screenshotDir, filename);
    await writeFile(screenshotPath, Buffer.from(screenshot));
  }

  return {
    ...safeValidation,
    screenshotBytes: screenshot?.byteLength ?? 0,
    screenshotPath,
  };
}

export function validationTargetsFromUnknown(input: unknown): ValidationTarget[] {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as { targets?: unknown }).targets : input;
  const items = Array.isArray(raw) ? raw : [];
  const targets: ValidationTarget[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const jobUrl = typeof record.jobUrl === "string" ? record.jobUrl.trim() : "";
    if (!jobUrl) continue;
    const target: ValidationTarget = { jobUrl };
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const platform = typeof record.platform === "string" ? record.platform.trim() : "";
    if (label) target.label = label;
    if (platform) target.platform = platform;
    targets.push(target);
  }
  return targets;
}

export async function validateAdapterTarget(
  target: ValidationTarget,
  options: AdapterValidationOptions = {},
): Promise<AdapterValidationResult> {
  const normalizedTarget: Required<ValidationTarget> = {
    label: target.label?.trim() || hostOrValue(target.jobUrl),
    platform: target.platform?.trim() || "",
    jobUrl: target.jobUrl,
  };
  const adapter = pickAdapter(normalizedTarget.platform, normalizedTarget.jobUrl);
  if (!adapter) {
    return {
      ok: true,
      target: normalizedTarget,
      adapter: null,
      validation: {
        ok: false,
        confidence: 0,
        reason: `unsupported_ats: ${normalizedTarget.platform || "unknown"}`,
        requiredFields: [],
        missingRequired: [],
        submitFound: false,
        resumeInputFound: false,
        screenshotBytes: 0,
        screenshotPath: null,
      },
    };
  }

  const context = validationContextFor(normalizedTarget);
  context.log = options.log ?? context.log;

  if (adapter.risk !== "server_safe") {
    const validation = await adapter.validate(null, context);
    return {
      ok: true,
      target: normalizedTarget,
      adapter: { id: adapter.id, version: adapter.version, risk: adapter.risk },
      validation: await normalizeValidation(validation, normalizedTarget, options.screenshotDir),
    };
  }

  const browser = await (options.launchBrowser ?? launchPlaywright)();
  const page = await browser.newPage();
  try {
    const validation = await adapter.validate(page, context);
    return {
      ok: true,
      target: normalizedTarget,
      adapter: { id: adapter.id, version: adapter.version, risk: adapter.risk },
      validation: await normalizeValidation(validation, normalizedTarget, options.screenshotDir),
    };
  } finally {
    await page.close?.().catch(() => {});
    await browser.close().catch(() => {});
  }
}
