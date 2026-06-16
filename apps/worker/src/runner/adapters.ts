/* eslint-disable @typescript-eslint/no-explicit-any */
import { pickOption, planFormFill, type ResolvableField } from "./field-resolver.js";
import { detectPageBlocker } from "./blockers.js";
import type { Adapter, AdapterContext, AdapterValidation, SubmitOutcome } from "./types.js";

// `document` / `CSS` are DOM globals available inside page.evaluate (the worker tsconfig has no DOM lib).
declare const document: any;
declare const CSS: { escape(value: string): string };

/**
 * Per-ATS submission adapters.
 *
 * IMPORTANT: the DOM selectors below are best-effort and must be validated against live forms in a
 * staging run before `APPLY_DRY_RUN` is turned off. Every step is defensive; an unfilled optional
 * field is fine, a missing *required* form is reported as a permanent failure for human review.
 * In dry-run mode the adapter fills the form and screenshots it but never clicks the final submit.
 */

function hostMatches(jobUrl: string, needles: string[]) {
  const url = jobUrl.toLowerCase();
  return needles.some((n) => url.includes(n));
}

async function screenshot(page: any): Promise<Uint8Array | null> {
  try {
    return await page.screenshot({ fullPage: true });
  } catch {
    return null;
  }
}

async function fillFirst(page: any, selectors: string[], value: string) {
  if (!value) return;
  for (const selector of selectors) {
    const locator = page.locator(selector);
    if (await locator.count().catch(() => 0)) {
      await locator.first().fill(value).catch(() => {});
      return;
    }
  }
}

async function attachResume(page: any, ctx: AdapterContext, selectors: string[]) {
  for (const selector of selectors) {
    const input = page.locator(selector);
    if (await input.count().catch(() => 0)) {
      await input
        .first()
        .setInputFiles({
          name: ctx.resume.filename,
          mimeType: ctx.resume.contentType,
          buffer: Buffer.from(ctx.resume.bytes),
        })
        .catch(() => {});
      return true;
    }
  }
  return false;
}

async function hasAny(page: any, selectors: string[]) {
  for (const selector of selectors) {
    const count = await page
      .locator(selector)
      .count()
      .catch(() => 0);
    if (count > 0) return true;
  }
  return false;
}

// ── Generalized screening-question handling ──────────────────────────────────────────────────
// Name/email/phone/resume is not enough: real ATS forms have required custom questions (work
// authorization, sponsorship, "why this company", EEO). We tag every control, answer what setup
// covers, and then HARD-GATE on any required field still blank so we never submit a wrong/blank
// answer under the candidate's name. (The DOM extraction is best-effort — validate in staging.)

const FILLABLE_TYPES = new Set(["text", "textarea", "email", "tel", "url", "number", "search", "select"]);

type ExtractedField = ResolvableField & { ref?: string; optionRefs?: Array<{ label: string; ref: string }> };

async function extractFields(page: any): Promise<ExtractedField[]> {
  try {
    return (await page.evaluate(() => {
      const labelFor = (el: any): string => {
        const id = el.id;
        if (id) {
          const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (l && l.textContent) return l.textContent;
        }
        const wrap = el.closest("label");
        if (wrap && wrap.textContent) return wrap.textContent;
        const aria = el.getAttribute("aria-label");
        if (aria) return aria;
        const labelledby = el.getAttribute("aria-labelledby");
        if (labelledby) {
          const l = document.getElementById(labelledby);
          if (l && l.textContent) return l.textContent;
        }
        return el.getAttribute("placeholder") || el.getAttribute("name") || "";
      };
      // For radios/checkboxes the question is on the wrapping fieldset/legend or group, not the option.
      const groupLabelFor = (el: any): string => {
        const fs = el.closest("fieldset");
        if (fs) {
          const legend = fs.querySelector("legend");
          if (legend && legend.textContent) return legend.textContent;
        }
        const grp = el.closest("[role='radiogroup'], [role='group']");
        if (grp) {
          const al = grp.getAttribute("aria-label");
          if (al) return al;
          const lb = grp.getAttribute("aria-labelledby");
          if (lb) {
            const e = document.getElementById(lb);
            if (e && e.textContent) return e.textContent;
          }
        }
        return labelFor(el);
      };
      const out: any[] = [];
      const groups: Record<string, any> = {};
      let idx = 0;
      for (const el of Array.from(document.querySelectorAll("input, select, textarea")) as any[]) {
        const tag = el.tagName.toLowerCase();
        const type = (el.type || tag).toLowerCase();
        if (["hidden", "submit", "button", "image", "reset"].includes(type)) continue;
        const ref = String(idx++);
        el.setAttribute("data-jp-field", ref);
        const required = Boolean(el.required) || el.getAttribute("aria-required") === "true";
        if (type === "radio" || type === "checkbox") {
          const name = el.name || el.id || ref;
          const optionLabel = (labelFor(el) || el.value || "").replace(/\s+/g, " ").trim().slice(0, 120);
          let group = groups[name];
          if (!group) {
            group = { ref, label: groupLabelFor(el).replace(/\s+/g, " ").trim().slice(0, 200), type, required, options: [], optionRefs: [] };
            groups[name] = group;
            out.push(group);
          }
          group.options.push(optionLabel);
          group.optionRefs.push({ label: optionLabel, ref });
          if (required) group.required = true;
          continue;
        }
        let options: string[] = [];
        if (tag === "select") {
          options = Array.from(el.options)
            .map((o: any) => (o.textContent || o.value || "").trim())
            .filter(Boolean);
        }
        out.push({ ref, label: labelFor(el).replace(/\s+/g, " ").trim().slice(0, 200), type: tag === "select" ? "select" : type, required, options });
      }
      return out;
    })) as ExtractedField[];
  } catch {
    return [];
  }
}

async function fillResolved(page: any, fills: Array<{ field: ExtractedField; value: string }>) {
  for (const { field, value } of fills) {
    if (!value) continue;
    const type = (field.type || "text").toLowerCase();

    // Radio/checkbox: only check an option we can confidently match (else leave it for the gate).
    if (type === "radio" || type === "checkbox") {
      const optionRefs = field.optionRefs ?? [];
      if (optionRefs.length === 0) continue;
      const match = pickOption(value, optionRefs.map((o) => o.label));
      if (!match) continue;
      const target = optionRefs.find((o) => o.label === match);
      if (target) await page.locator(`[data-jp-field="${target.ref}"]`).check().catch(() => {});
      continue;
    }

    const ref = field.ref;
    if (!ref || !FILLABLE_TYPES.has(type)) continue;
    const loc = page.locator(`[data-jp-field="${ref}"]`);
    try {
      if (type === "select") {
        await loc.selectOption({ label: value }).catch(async () => {
          await loc.selectOption(value).catch(() => {});
        });
      } else {
        await loc.fill(value).catch(() => {});
      }
    } catch {
      /* best effort */
    }
  }
}

/** Ground truth after filling: labels of required, non-file controls still empty/unchecked. */
async function unsatisfiedRequiredFields(page: any): Promise<string[]> {
  try {
    return (await page.evaluate(() => {
      const labelFor = (el: any): string => {
        const id = el.id;
        if (id) {
          const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (l && l.textContent) return l.textContent;
        }
        const wrap = el.closest("label");
        if (wrap && wrap.textContent) return wrap.textContent;
        return el.getAttribute("aria-label") || el.getAttribute("name") || "this question";
      };
      const out: string[] = [];
      const groups: Record<string, boolean> = {};
      const groupLabel: Record<string, string> = {};
      for (const el of Array.from(document.querySelectorAll("input, select, textarea")) as any[]) {
        const tag = (el as any).tagName.toLowerCase();
        const type = ((el as any).type || tag).toLowerCase();
        if (["hidden", "submit", "button", "image", "reset", "file"].includes(type)) continue;
        const required = Boolean((el as any).required) || el.getAttribute("aria-required") === "true";
        if (type === "radio" || type === "checkbox") {
          const name = (el as any).name || (el as any).id || "";
          if (required) {
            groups[name] = Boolean(groups[name]) || Boolean((el as any).checked);
            if (!groupLabel[name]) groupLabel[name] = labelFor(el);
          }
          continue;
        }
        if (!required) continue;
        if (!((el as any).value || "").trim()) out.push(labelFor(el).replace(/\s+/g, " ").trim().slice(0, 120));
      }
      for (const name of Object.keys(groups)) {
        if (!groups[name]) out.push((groupLabel[name] || "this question").replace(/\s+/g, " ").trim().slice(0, 120));
      }
      return out;
    })) as string[];
  } catch {
    return [];
  }
}

type FormSpec = {
  firstName: string[];
  lastName: string[];
  fullName: string[];
  email: string[];
  phone: string[];
  resume: string[];
  submit: string[];
  /** A selector or URL fragment that confirms a successful submission. */
  confirm: { selector?: string; urlIncludes?: string };
};

const REQUIRED_FIELDS = ["applicant_name", "email", "resume", "submit"] as const;

function validationReason(blocker: string | null | undefined, missingRequired: string[]) {
  if (blocker === "captcha_required") return "captcha_required";
  if (blocker === "login_required") return "login_required";
  if (blocker === "closed_job") return "closed_job";
  if (blocker === "unsupported_flow") return "unsupported_flow";
  if (missingRequired.includes("form")) return "form_not_found";
  if (missingRequired.length > 0) return `missing_required_field:${missingRequired.join(",")}`;
  return null;
}

function confidenceFor(found: number, total: number, blocker: string | null | undefined, formFound: boolean) {
  if (blocker || !formFound) return 0;
  if (found === total) return 1;
  return Math.max(0.2, Math.round((found / total) * 100) / 100);
}

async function validateForm(page: any, ctx: AdapterContext, spec: FormSpec): Promise<AdapterValidation> {
  try {
    await page.goto(ctx.jobUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch (err) {
    return {
      ok: false,
      confidence: 0,
      blocker: null,
      reason: `navigation_failed: ${(err as Error).message}`,
      requiredFields: [...REQUIRED_FIELDS],
      missingRequired: ["form"],
      submitFound: false,
      resumeInputFound: false,
    };
  }

  const blocker = await detectPageBlocker(page);
  const fullNameFound = await hasAny(page, spec.fullName);
  const firstNameFound = await hasAny(page, spec.firstName);
  const lastNameFound = await hasAny(page, spec.lastName);
  const nameFound = fullNameFound || (firstNameFound && lastNameFound);
  const emailFound = await hasAny(page, spec.email);
  const resumeInputFound = await hasAny(page, spec.resume);
  const submitFound = await hasAny(page, spec.submit);
  const formFound = nameFound || emailFound || resumeInputFound || submitFound;

  const missingRequired: string[] = [];
  if (!formFound) {
    missingRequired.push("form");
  } else {
    if (!nameFound) missingRequired.push("applicant_name");
    if (!emailFound) missingRequired.push("email");
    if (!resumeInputFound) missingRequired.push("resume");
    if (!submitFound) missingRequired.push("submit");
  }

  const ok = !blocker.blocker && missingRequired.length === 0;
  const foundCount = REQUIRED_FIELDS.length - missingRequired.filter((f) => f !== "form").length;
  return {
    ok,
    confidence: confidenceFor(foundCount, REQUIRED_FIELDS.length, blocker.blocker, formFound),
    blocker: blocker.blocker,
    reason: validationReason(blocker.blocker, missingRequired),
    requiredFields: [...REQUIRED_FIELDS],
    missingRequired,
    submitFound,
    resumeInputFound,
    screenshot: ok ? null : await screenshot(page),
  };
}

/** Shared fill → (dry-run stop | submit + confirm) flow used by every adapter. */
async function runForm(page: any, ctx: AdapterContext, spec: FormSpec): Promise<SubmitOutcome> {
  const { applicant, dryRun, log } = ctx;
  const validation = await validateForm(page, ctx, spec);
  if (!validation.ok) {
    return {
      status: "failed",
      reason: validation.reason ?? "adapter_validation_failed",
      permanent: true,
      screenshot: validation.screenshot,
    };
  }

  await fillFirst(page, spec.fullName, applicant.fullName);
  await fillFirst(page, spec.firstName, applicant.firstName);
  await fillFirst(page, spec.lastName, applicant.lastName);
  await fillFirst(page, spec.email, applicant.email);
  await fillFirst(page, spec.phone, applicant.phone);
  const attached = await attachResume(page, ctx, spec.resume);
  if (!attached) log("resume file input not found — submitting without an attached file");

  // Answer screening questions from the setup profile (work auth, sponsorship, reusable answers).
  if (ctx.masterProfile) {
    const fields = await extractFields(page);
    if (fields.length > 0) {
      const plan = planFormFill(fields, ctx.masterProfile, { demographicsEnabled: ctx.demographicsEnabled ?? false });
      await fillResolved(page, plan.fills);
      if (plan.fills.length > 0) log(`answered ${plan.fills.length} screening field(s) from setup`);
    }
  }

  // HARD GATE: never submit with a required question left blank — route to human review instead.
  const unmet = await unsatisfiedRequiredFields(page);
  if (unmet.length > 0) {
    log(`required questions unanswered: ${unmet.slice(0, 6).join("; ")}`);
    return {
      status: "failed",
      reason: `unanswered_required:${unmet.slice(0, 6).join("; ")}`.slice(0, 280),
      permanent: true,
      screenshot: await screenshot(page),
    };
  }

  const shot = await screenshot(page);

  if (dryRun) {
    return { status: "skipped", reason: "dry_run: filled, not submitted", screenshot: shot };
  }

  const submit = page.locator(spec.submit.join(", "));
  if (!(await submit.count().catch(() => 0))) {
    return { status: "failed", reason: "submit_button_not_found", permanent: true, screenshot: shot };
  }
  await submit.first().click().catch(() => {});

  // Confirm submission.
  try {
    if (spec.confirm.selector) {
      await page.locator(spec.confirm.selector).first().waitFor({ timeout: 20_000 });
    } else if (spec.confirm.urlIncludes) {
      await page.waitForURL((u: URL) => u.toString().includes(spec.confirm.urlIncludes!), { timeout: 20_000 });
    } else {
      await page.waitForTimeout(3_000);
    }
  } catch {
    return {
      status: "failed",
      reason: "confirmation_timeout: could not verify submission",
      permanent: false,
      screenshot: await screenshot(page),
    };
  }
  return { status: "submitted", screenshot: await screenshot(page) };
}

export const greenhouseAdapter: Adapter = {
  id: "greenhouse",
  version: "2026-06-15",
  risk: "server_safe",
  matches: ({ platform, jobUrl }) =>
    platform === "greenhouse" || hostMatches(jobUrl, ["greenhouse.io", "boards.greenhouse"]),
  validate: (page, ctx) =>
    validateForm(page, ctx, {
      firstName: ["#first_name", "input[name='job_application[first_name]']", "input[name='first_name']", "input[autocomplete='given-name']"],
      lastName: ["#last_name", "input[name='job_application[last_name]']", "input[name='last_name']", "input[autocomplete='family-name']"],
      fullName: ["#name", "input[autocomplete='name']"],
      email: ["#email", "input[type='email']", "input[name='job_application[email]']"],
      phone: ["#phone", "input[type='tel']", "input[name='job_application[phone]']"],
      resume: ["input[type='file']#resume", "#resume", "input[type='file'][name*='resume' i]", "input[type='file']"],
      submit: ["#submit_app", "button#submit_app", "button:has-text('Submit Application')", "button[type='submit']"],
      confirm: { selector: "text=/application.*(received|submitted)/i" },
    }),
  submit: (page, ctx) =>
    runForm(page, ctx, {
      firstName: ["#first_name", "input[name='job_application[first_name]']", "input[name='first_name']", "input[autocomplete='given-name']"],
      lastName: ["#last_name", "input[name='job_application[last_name]']", "input[name='last_name']", "input[autocomplete='family-name']"],
      fullName: ["#name", "input[autocomplete='name']"],
      email: ["#email", "input[type='email']", "input[name='job_application[email]']"],
      phone: ["#phone", "input[type='tel']", "input[name='job_application[phone]']"],
      resume: ["input[type='file']#resume", "#resume", "input[type='file'][name*='resume' i]", "input[type='file']"],
      submit: ["#submit_app", "button#submit_app", "button:has-text('Submit Application')", "button[type='submit']"],
      confirm: { selector: "text=/application.*(received|submitted)/i" },
    }),
};

export const leverAdapter: Adapter = {
  id: "lever",
  version: "2026-06-15",
  risk: "server_safe",
  matches: ({ platform, jobUrl }) => platform === "lever" || hostMatches(jobUrl, ["jobs.lever.co"]),
  validate: (page, ctx) =>
    validateForm(page, ctx, {
      firstName: [],
      lastName: [],
      fullName: ["input[name='name']", "#name", "input[autocomplete='name']"],
      email: ["input[name='email']", "#email", "input[type='email']"],
      phone: ["input[name='phone']", "#phone", "input[type='tel']"],
      resume: ["input[name='resume']", "input[type='file'][name*='resume' i]", "input[type='file']"],
      submit: ["button.template-btn-submit", "button:has-text('Submit application')", "button[type='submit']"],
      confirm: { urlIncludes: "thanks" },
    }),
  submit: (page, ctx) =>
    runForm(page, ctx, {
      firstName: [],
      lastName: [],
      fullName: ["input[name='name']", "#name", "input[autocomplete='name']"],
      email: ["input[name='email']", "#email", "input[type='email']"],
      phone: ["input[name='phone']", "#phone", "input[type='tel']"],
      resume: ["input[name='resume']", "input[type='file'][name*='resume' i]", "input[type='file']"],
      submit: ["button.template-btn-submit", "button:has-text('Submit application')", "button[type='submit']"],
      confirm: { urlIncludes: "thanks" },
    }),
};

export const ashbyAdapter: Adapter = {
  id: "ashby",
  version: "2026-06-15",
  risk: "server_safe",
  matches: ({ platform, jobUrl }) => platform === "ashby" || hostMatches(jobUrl, ["ashbyhq.com"]),
  validate: (page, ctx) =>
    validateForm(page, ctx, {
      firstName: ["input[name='firstName']", "input[autocomplete='given-name']"],
      lastName: ["input[name='lastName']", "input[autocomplete='family-name']"],
      fullName: ["input[name='name']", "input[autocomplete='name']"],
      email: ["input[name='email']", "input[type='email']"],
      phone: ["input[name='phone']", "input[type='tel']"],
      resume: ["input[type='file'][name*='resume' i]", "input[type='file'][accept*='pdf']", "input[type='file']"],
      submit: ["button:has-text('Submit Application')", "button:has-text('Submit application')", "button[type='submit']"],
      confirm: { selector: "text=/application.*(received|submitted)|thank you/i" },
    }),
  submit: (page, ctx) =>
    runForm(page, ctx, {
      firstName: ["input[name='firstName']", "input[autocomplete='given-name']"],
      lastName: ["input[name='lastName']", "input[autocomplete='family-name']"],
      fullName: ["input[name='name']", "input[autocomplete='name']"],
      email: ["input[name='email']", "input[type='email']"],
      phone: ["input[name='phone']", "input[type='tel']"],
      resume: ["input[type='file'][name*='resume' i]", "input[type='file'][accept*='pdf']", "input[type='file']"],
      submit: ["button:has-text('Submit Application')", "button:has-text('Submit application')", "button[type='submit']"],
      confirm: { selector: "text=/application.*(received|submitted)|thank you/i" },
    }),
};

function reviewOnlyAdapter(id: string, hosts: string[]): Adapter {
  return {
    id,
    version: "2026-06-15",
    risk: "review_only",
    matches: ({ platform, jobUrl }) => platform === id || hostMatches(jobUrl, hosts),
    async validate() {
      return {
        ok: false,
        confidence: 0,
        blocker: "unsupported_flow",
        reason: `adapter_not_server_safe:${id}`,
        requiredFields: [...REQUIRED_FIELDS],
        missingRequired: [...REQUIRED_FIELDS],
        submitFound: false,
        resumeInputFound: false,
        screenshot: null,
      };
    },
    async submit() {
      return { status: "failed", reason: `adapter_not_server_safe:${id}`, permanent: true };
    },
  };
}

const ADAPTERS: Adapter[] = [
  greenhouseAdapter,
  leverAdapter,
  ashbyAdapter,
  reviewOnlyAdapter("workday", ["myworkdayjobs.com", "workdayjobs.com"]),
  reviewOnlyAdapter("linkedin", ["linkedin.com"]),
  reviewOnlyAdapter("icims", ["icims.com"]),
  reviewOnlyAdapter("workable", ["workable.com"]),
  reviewOnlyAdapter("smartrecruiters", ["smartrecruiters.com"]),
  reviewOnlyAdapter("taleo", ["taleo.net", "oraclecloud.com"]),
  reviewOnlyAdapter("successfactors", ["successfactors.com"]),
  reviewOnlyAdapter("jobvite", ["jobvite.com"]),
  reviewOnlyAdapter("bamboohr", ["bamboohr.com"]),
  reviewOnlyAdapter("indeed", ["indeed.com"]),
  reviewOnlyAdapter("rippling", ["rippling.com"]),
  reviewOnlyAdapter("paylocity", ["paylocity.com"]),
  reviewOnlyAdapter("recruitee", ["recruitee.com"]),
  reviewOnlyAdapter("teamtailor", ["teamtailor.com"]),
  reviewOnlyAdapter("personio", ["personio.com", "jobs.personio.de"]),
  reviewOnlyAdapter("jazzhr", ["applytojob.com", "jazz.co"]),
  reviewOnlyAdapter("breezy", ["breezy.hr"]),
  reviewOnlyAdapter("comeet", ["comeet.com"]),
  reviewOnlyAdapter("pinpoint", ["pinpointhq.com"]),
  reviewOnlyAdapter("clearcompany", ["clearcompany.com"]),
  reviewOnlyAdapter("paycom", ["paycomonline.net"]),
  reviewOnlyAdapter("ukg", ["ultipro.com", "ukg.com", "ukg.net"]),
  reviewOnlyAdapter("ceipal", ["ceipal.com"]),
  reviewOnlyAdapter("trakstar", ["trakstar.com", "hire.trakstar.com"]),
  reviewOnlyAdapter("recruiterbox", ["recruiterbox.com"]),
  reviewOnlyAdapter("jobsoid", ["jobsoid.com"]),
];

/** Pick an adapter for a job, or null when no ATS is supported (→ permanent failure / review). */
export function pickAdapter(platform: string, jobUrl: string): Adapter | null {
  return ADAPTERS.find((a) => a.matches({ platform, jobUrl })) ?? null;
}
