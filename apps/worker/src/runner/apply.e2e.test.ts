/**
 * End-to-end apply check. Drives the REAL ATS adapters (`greenhouseAdapter`, real `pickAdapter`)
 * and the REAL batch runner (`runApplyBatch`) against a faithful in-memory DOM, so the adapter's
 * actual form-extraction (`page.evaluate`), field filling, screening-question answering, and the
 * required-field hard gate all execute. Asserts the worker applies to a server-safe form without
 * failing, routes risky/unknown ATS to review, and never submits with a required question blank.
 */
import { describe, expect, it } from "vitest";
import { greenhouseAdapter, pickAdapter } from "./adapters.js";
import { runApplyBatch } from "./runner.js";
import { computeUsageStatus, type UsageStatus } from "./usage.js";
import type { RunnerDb } from "./db.js";
import type { LaunchBrowser } from "./browser.js";
import type { AdapterContext, ApplyJob } from "./types.js";
import type { MasterProfile } from "./field-resolver.js";

// ── Tiny in-memory DOM ────────────────────────────────────────────────────────────────────────
// Enough surface for the adapter's evaluate() closures (querySelectorAll/closest/getAttribute/…)
// and for selector-based locators (#id, tag[attr='v' i], [data-jp-field="n"]).

type ElSpec = {
  tag: "input" | "select" | "textarea" | "button" | "label" | "fieldset" | "legend";
  type?: string;
  id?: string;
  name?: string;
  required?: boolean;
  value?: string;
  checked?: boolean;
  text?: string;
  attrs?: Record<string, string>;
  options?: Array<{ label: string; value?: string }>;
  children?: El[];
};

class El {
  tagName: string;
  type?: string;
  id: string;
  name: string;
  required: boolean;
  value: string;
  checked: boolean;
  textContent: string;
  options?: Array<{ textContent: string; value: string }>;
  attrs: Record<string, string>;
  parent: El | null = null;

  constructor(spec: ElSpec) {
    this.tagName = spec.tag.toUpperCase();
    this.type = spec.type;
    this.id = spec.id ?? "";
    this.name = spec.name ?? "";
    this.required = spec.required ?? false;
    this.value = spec.value ?? "";
    this.checked = spec.checked ?? false;
    this.textContent = spec.text ?? "";
    this.attrs = { ...(spec.attrs ?? {}) };
    if (spec.type) this.attrs.type = spec.type;
    if (spec.id) this.attrs.id = spec.id;
    if (spec.name) this.attrs.name = spec.name;
    if (spec.options) this.options = spec.options.map((o) => ({ textContent: o.label, value: o.value ?? o.label }));
    for (const child of spec.children ?? []) child.parent = this;
  }

  getAttribute(key: string): string | null {
    if (key === "aria-required") return this.required ? "true" : (this.attrs["aria-required"] ?? null);
    return key in this.attrs ? this.attrs[key]! : null;
  }
  setAttribute(key: string, value: string) {
    this.attrs[key] = value;
  }
  closest(selector: string): El | null {
    const parts = selector.split(",").map((s) => s.trim());
    let node: El | null = this;
    while (node) {
      if (parts.some((p) => matchOne(node!, p))) return node;
      node = node.parent;
    }
    return null;
  }
  querySelector(selector: string): El | null {
    return descendants(this).find((el) => matchOne(el, selector)) ?? null;
  }
}

function descendants(root: El): El[] {
  // Our tree is shallow (fieldset → legend/label → input); flatten via the flat registry instead.
  return REGISTRY.filter((el) => {
    let n: El | null = el.parent;
    while (n) {
      if (n === root) return true;
      n = n.parent;
    }
    return false;
  });
}

let REGISTRY: El[] = [];

/**
 * Parse a simple CSS selector: optional tag, optional #id, and [attr op 'value' i] clauses.
 * Anything we can't parse (class selectors, combinators, :has-text, text=) is treated as NO match,
 * never a wildcard — otherwise the blocker detector's class selectors would match everything.
 */
function matchOne(el: El, selector: string): boolean {
  let rest = selector.trim();
  if (!rest || rest.includes(":has-text") || rest.startsWith("text=")) return false;

  let tag: string | null = null;
  const tagMatch = rest.match(/^([a-zA-Z]+)/);
  if (tagMatch) {
    tag = tagMatch[1]!.toUpperCase();
    rest = rest.slice(tagMatch[1]!.length);
  }
  if (tag && el.tagName !== tag) return false;

  const idMatch = rest.match(/^#([\w-]+)/);
  if (idMatch) {
    if (el.id !== idMatch[1]) return false;
    rest = rest.slice(idMatch[0].length);
  }

  while (rest.startsWith("[")) {
    const m = rest.match(/^\[([\w-]+)(?:([*^$|~]?=)(?:'([^']*)'|"([^"]*)"))?\s*(i)?\]/);
    if (!m) return false;
    const [, name, op, sq, dq, flag] = m;
    const want = sq ?? dq ?? "";
    const actual =
      name === "type" ? el.type ?? "" : name === "name" ? el.name : name === "id" ? el.id : el.getAttribute(name!) ?? "";
    if (op) {
      const a = flag ? actual.toLowerCase() : actual;
      const w = flag ? want.toLowerCase() : want;
      if (op === "=" && a !== w) return false;
      if (op === "*=" && !a.includes(w)) return false;
      if (op === "^=" && !a.startsWith(w)) return false;
      if (op === "$=" && !a.endsWith(w)) return false;
    } else if (!actual) {
      return false; // presence required
    }
    rest = rest.slice(m[0].length);
  }

  return rest.trim() === ""; // unparsed remainder (e.g. ".class") → no match
}

function matchAll(selector: string): El[] {
  const parts = selector.split(",").map((s) => s.trim());
  const out: El[] = [];
  for (const el of REGISTRY) {
    if (parts.some((p) => matchOne(el, p)) && !out.includes(el)) out.push(el);
  }
  return out;
}

// ── Fake Playwright page over the DOM ───────────────────────────────────────────────────────────
function makePage(form: El[], bodyText: string) {
  REGISTRY = [];
  // Flatten the form tree into REGISTRY in document order (parent before its children).
  const flatten = (nodes: El[]) => {
    for (const el of nodes) {
      REGISTRY.push(el);
      const kids = childrenOf(el);
      if (kids.length) flatten(kids);
    }
  };
  flatten(form);

  const documentShim = {
    querySelectorAll: (sel: string) => {
      const tags = sel.split(",").map((s) => s.trim().toUpperCase());
      return REGISTRY.filter((el) => tags.includes(el.tagName));
    },
    querySelector: (sel: string) => REGISTRY.find((el) => matchOne(el, sel)) ?? null,
    getElementById: (id: string) => REGISTRY.find((el) => el.id === id) ?? null,
  };

  function locator(selector: string) {
    const els = selector === "body" ? [] : matchAll(selector);
    const handle = {
      async fill(v: string) {
        if (els[0]) els[0].value = v;
      },
      async setInputFiles(_file: unknown) {
        if (els[0]) els[0].value = "resume.pdf";
      },
      async check() {
        if (els[0]) els[0].checked = true;
      },
      async click() {},
      async waitFor() {},
      async selectOption(arg: unknown) {
        if (els[0]) els[0].value = typeof arg === "string" ? arg : ((arg as { label?: string })?.label ?? "");
      },
    };
    return {
      async count() {
        return els.length;
      },
      first() {
        return handle;
      },
      async innerText() {
        return selector === "body" ? bodyText : (els[0]?.textContent ?? "");
      },
      async fill(v: string) {
        await handle.fill(v);
      },
      async check() {
        await handle.check();
      },
      async selectOption(arg: unknown) {
        await handle.selectOption(arg);
      },
    };
  }

  return {
    async goto() {},
    locator,
    async evaluate(fn: (...a: unknown[]) => unknown) {
      const g = globalThis as unknown as Record<string, unknown>;
      const prevDoc = g.document;
      const prevCss = g.CSS;
      g.document = documentShim;
      g.CSS = { escape: (s: string) => s };
      try {
        return fn();
      } finally {
        g.document = prevDoc;
        g.CSS = prevCss;
      }
    },
    async screenshot() {
      return new Uint8Array([1, 2, 3]);
    },
    async content() {
      return bodyText;
    },
    async waitForTimeout() {},
    async waitForURL() {},
    async close() {},
  };
}

// children are tracked separately so REGISTRY ordering is document order.
const CHILDREN = new WeakMap<El, El[]>();
function childrenOf(el: El): El[] {
  return CHILDREN.get(el) ?? [];
}
function node(spec: ElSpec): El {
  const el = new El(spec);
  CHILDREN.set(el, spec.children ?? []);
  return el;
}

/** A realistic hosted-Greenhouse application form. */
function greenhouseForm(opts: { withUnanswerableRequired?: boolean } = {}): El[] {
  const yes = node({ tag: "input", type: "radio", name: "work_auth", value: "Yes", required: true });
  const no = node({ tag: "input", type: "radio", name: "work_auth", value: "No", required: true });
  const fieldset = node({
    tag: "fieldset",
    children: [
      node({ tag: "legend", text: "Are you authorized to work in the United States?" }),
      node({ tag: "label", text: "Yes", children: [yes] }),
      node({ tag: "label", text: "No", children: [no] }),
    ],
  });
  const form: El[] = [
    node({ tag: "input", type: "text", id: "name", name: "name", required: true, attrs: { "aria-label": "Full name" } }),
    node({ tag: "input", type: "email", id: "email", name: "email", required: true, attrs: { "aria-label": "Email" } }),
    node({ tag: "input", type: "tel", id: "phone", name: "phone", attrs: { "aria-label": "Phone" } }),
    node({ tag: "input", type: "file", id: "resume", name: "resume", required: true, attrs: { "aria-label": "Resume" } }),
    fieldset,
    node({ tag: "button", type: "submit", id: "submit_app", text: "Submit Application" }),
  ];
  if (opts.withUnanswerableRequired) {
    form.splice(4, 0, node({ tag: "textarea", id: "why", name: "why", required: true, attrs: { "aria-label": "Why do you want to join Acme?" } }));
  }
  return form;
}

function masterProfile(): MasterProfile {
  return {
    identity: { firstName: "Casey", lastName: "Dev", email: "casey@example.com", phone: "+1 555 0100" },
    location: { city: "Austin", state: "TX", country: "United States" },
    links: { website: [] },
    workAuth: { authorizedToWork: true, requiresSponsorship: false, country: "United States" },
    demographics: {},
    experience: [],
    education: [],
    skills: ["React", "TypeScript"],
    answers: [],
    documents: {},
  };
}

function ctx(form: El[], overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    job: {
      id: "app_1",
      userId: "user_1",
      jobId: "job_1",
      fieldMap: { jobUrl: "https://boards.greenhouse.io/acme/jobs/1", platform: "greenhouse" },
      baseVersionId: "base_1",
      resumeVariantId: null,
      renderedPdfPath: "user_1/applications/app_1.pdf",
      attempts: 1,
    },
    jobUrl: "https://boards.greenhouse.io/acme/jobs/1",
    applicant: {
      fullName: "Casey Dev",
      firstName: "Casey",
      lastName: "Dev",
      email: "casey@example.com",
      phone: "+1 555 0100",
      location: "Austin, TX",
      linkedin: "",
      portfolio: "",
      github: "",
    },
    masterProfile: masterProfile(),
    demographicsEnabled: false,
    resume: { path: "user_1/base/x.pdf", bytes: new Uint8Array([1]), filename: "resume.pdf", contentType: "application/pdf" },
    dryRun: true,
    log: () => {},
    ...overrides,
  };
}

describe("E2E: Greenhouse adapter fills a real form and answers screening questions", () => {
  it("dry-run fills name/email/phone, answers work-auth, and stops before submitting", async () => {
    const form = greenhouseForm();
    const page = makePage(form, "Apply for this role at Acme. Submit your application below.");
    const outcome = await greenhouseAdapter.submit(page, ctx(form));

    expect(outcome.status).toBe("skipped"); // dry-run: filled, not submitted — i.e. no failure

    const byId = (id: string) => form.flatMap(flat).find((el) => el.id === id);
    expect(byId("name")?.value).toBe("Casey Dev");
    expect(byId("email")?.value).toBe("casey@example.com");
    expect(byId("phone")?.value).toBe("+1 555 0100");
    expect(byId("resume")?.value).toBe("resume.pdf"); // resume attached

    // The required "authorized to work" question was answered "Yes".
    const yesRadio = form.flatMap(flat).find((el) => el.tagName === "INPUT" && el.value === "Yes");
    expect(yesRadio?.checked).toBe(true);
  });

  it("HARD-GATES: never submits when a required question can't be answered", async () => {
    const form = greenhouseForm({ withUnanswerableRequired: true });
    const page = makePage(form, "Apply for this role at Acme.");
    const outcome = await greenhouseAdapter.submit(page, ctx(form, { dryRun: false }));

    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") {
      expect(outcome.reason).toMatch(/unanswered_required/);
      expect(outcome.permanent).toBe(true);
    }
  });
});

// flatten helper for assertions (form tree → all els)
function flat(el: El): El[] {
  return [el, ...childrenOf(el).flatMap(flat)];
}

// ── runApplyBatch over a mixed queue, real pickAdapter ──────────────────────────────────────────
type Update = { id: string; status: string; reason?: string | null };

function fakeDb(jobs: ApplyJob[], updates: Update[]): RunnerDb {
  const usage: UsageStatus = computeUsageStatus({
    subscription: { plan: "jobposted_20", status: "active", dailyLimit: 20 },
    todaySubmitted: 0,
    totalSubmitted: 0,
  });
  return {
    async claim() {
      return jobs;
    },
    async usageFor() {
      return usage;
    },
    async loadApplicant() {
      return {
        fullName: "Casey Dev",
        firstName: "Casey",
        lastName: "Dev",
        email: "casey@example.com",
        phone: "+1 555 0100",
        location: "Austin, TX",
        linkedin: "",
        portfolio: "",
        github: "",
      };
    },
    async loadMasterProfile() {
      return masterProfile();
    },
    async resolveResume() {
      return { path: "user_1/base/x.pdf", bytes: new Uint8Array([1]), filename: "resume.pdf", contentType: "application/pdf" };
    },
    async markSubmitted(id) {
      updates.push({ id, status: "submitted" });
    },
    async markStatus(id, status, o) {
      updates.push({ id, status, reason: o.reason });
    },
    async uploadScreenshot() {
      return "user_1/applications/app_1.png";
    },
  };
}

function queuedJob(id: string, jobUrl: string, platform: string): ApplyJob {
  return {
    id,
    userId: "user_1",
    jobId: `job_${id}`,
    fieldMap: { jobUrl, platform },
    baseVersionId: "base_1",
    resumeVariantId: null,
    renderedPdfPath: "user_1/applications/app.pdf",
    attempts: 1,
  };
}

describe("E2E: runApplyBatch applies to server-safe jobs without failing, routes the rest to review", () => {
  it("greenhouse → filled (dry-run), workday → review, unknown ATS → review, zero failures", async () => {
    const jobs: ApplyJob[] = [
      queuedJob("gh", "https://boards.greenhouse.io/acme/jobs/1", "greenhouse"),
      queuedJob("wd", "https://acme.wd1.myworkdayjobs.com/jobs/2", "workday"),
      queuedJob("unknown", "https://careers.acme.com/job/3", ""),
    ];
    const updates: Update[] = [];
    const db = fakeDb(jobs, updates);

    const browser: LaunchBrowser = (async () => {
      const form = greenhouseForm();
      const page = makePage(form, "Apply for this role at Acme. Submit your application below.");
      return {
        async newPage() {
          return page;
        },
        async close() {},
      };
    }) as unknown as LaunchBrowser;

    const summary = await runApplyBatch({ db, launchBrowser: browser, pickAdapter, dryRun: true });

    expect(summary.claimed).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.submitted).toBe(0); // dry-run
    expect(summary.skipped).toBe(1); // greenhouse filled, not submitted
    expect(summary.review).toBe(2); // workday + unknown

    const status = (id: string) => updates.find((u) => u.id === id)?.status;
    expect(status("gh")).toBe("queued"); // dry-run restores to queue
    expect(status("wd")).toBe("ready_for_review");
    expect(status("unknown")).toBe("ready_for_review");
    expect(updates.find((u) => u.id === "unknown")?.reason).toMatch(/unsupported_ats/);
  });
});
