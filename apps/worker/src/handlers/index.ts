import type { Page } from "playwright";
import type { AtsType } from "@jobposted/shared";
import { pause } from "../browser";

export interface AtsHandler {
  atsType: AtsType;
  matches(host: string): boolean;
  /** Navigate to / reveal the fillable application form. */
  gotoForm(page: Page, applyUrl: string): Promise<void>;
  /** CSS scope for field extraction (optional). */
  formSelector?: string;
  /** Candidate submit-button selectors, tried in order. */
  submitSelectors: string[];
  /** Heuristic: did the submission succeed? */
  submitted(page: Page): Promise<boolean>;
}

async function gotoAndSettle(page: Page, url: string, waitFor: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(waitFor, { timeout: 12000 }).catch(() => {});
  await pause(800);
}

async function bodyHas(page: Page, re: RegExp): Promise<boolean> {
  const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
  return re.test(text);
}

const SUCCESS = /thank you|application (was )?(received|submitted)|we('| ha)ve received/i;

const greenhouse: AtsHandler = {
  atsType: "greenhouse",
  matches: (h) => h.includes("greenhouse.io"),
  formSelector: "#application-form, form[action*='application'], main",
  submitSelectors: ["#submit_app", "button[type='submit']", "input[type='submit']", "button:has-text('Submit')"],
  async gotoForm(page, url) {
    await gotoAndSettle(page, url, "input#first_name, input[name='job_application[first_name]'], #application-form");
    const applyBtn = page.locator("a:has-text('Apply'), button:has-text('Apply')").first();
    if ((await page.locator("input#first_name").count()) === 0 && (await applyBtn.count()) > 0) {
      await applyBtn.click().catch(() => {});
      await pause(1200);
    }
  },
  submitted: (page) => bodyHas(page, SUCCESS),
};

const lever: AtsHandler = {
  atsType: "lever",
  matches: (h) => h.includes("lever.co"),
  formSelector: "form, .application-form, #application-form",
  submitSelectors: ["#btn-submit", "button[type='submit']", "button:has-text('Submit application')"],
  async gotoForm(page, url) {
    const applyUrl = /\/apply\b/.test(url) ? url : `${url.replace(/\/$/, "")}/apply`;
    await gotoAndSettle(page, applyUrl, "input[name='name'], input[name='email'], .application-form");
  },
  submitted: (page) =>
    Promise.resolve(/\/thanks|\/confirmation/.test(page.url())).then(
      (hit) => hit || bodyHas(page, SUCCESS),
    ),
};

const ashby: AtsHandler = {
  atsType: "ashby",
  matches: (h) => h.includes("ashbyhq.com"),
  formSelector: "form, [class*='application'], [class*='Application']",
  submitSelectors: ["button:has-text('Submit Application')", "button:has-text('Submit')", "button[type='submit']"],
  async gotoForm(page, url) {
    await gotoAndSettle(page, url, "form, input[type='email']");
    const applyBtn = page.locator("button:has-text('Apply'), a:has-text('Apply')").first();
    if ((await page.locator("input[type='email']").count()) === 0 && (await applyBtn.count()) > 0) {
      await applyBtn.click().catch(() => {});
      await pause(1500);
    }
  },
  submitted: (page) => bodyHas(page, SUCCESS),
};

const generic: AtsHandler = {
  atsType: "other",
  matches: () => true,
  submitSelectors: [
    "button[type='submit']",
    "input[type='submit']",
    "button:has-text('Submit')",
    "button:has-text('Apply')",
  ],
  async gotoForm(page, url) {
    await gotoAndSettle(page, url, "form, input[type='email']");
  },
  submitted: (page) => bodyHas(page, SUCCESS),
};

const HANDLERS = [greenhouse, lever, ashby];

/** Pick the ATS handler for a URL host, falling back to the generic vision handler (§11.6). */
export function pickHandler(applyUrl: string): AtsHandler {
  let host = "";
  try {
    host = new URL(applyUrl).hostname;
  } catch {
    /* ignore */
  }
  return HANDLERS.find((h) => h.matches(host)) ?? generic;
}
