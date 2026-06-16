/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageBlocker } from "./types.js";

export type BlockerDetection = {
  blocker: PageBlocker | null;
  reason: string | null;
};

type Pattern = {
  blocker: PageBlocker;
  reason: string;
  selectors: string[];
  text: RegExp[];
};

const PATTERNS: Pattern[] = [
  {
    blocker: "captcha_required",
    reason: "captcha_required",
    selectors: [
      "iframe[src*='recaptcha']",
      "iframe[src*='hcaptcha']",
      "iframe[src*='challenges.cloudflare.com']",
      ".g-recaptcha",
      ".h-captcha",
      ".cf-turnstile",
      "#challenge-running",
      "[data-sitekey]",
      "[data-cf-turnstile-response]",
      "input[name='cf-turnstile-response']",
    ],
    text: [/verify you are human/i, /\bcaptcha\b/i, /hcaptcha/i, /recaptcha/i, /security check/i, /checking if the site connection is secure/i],
  },
  {
    blocker: "login_required",
    reason: "login_required",
    selectors: [
      "input[type='password']",
      "input[name='password']",
      "form[action*='login' i]",
      "button:has-text('Sign in')",
      "button:has-text('Log in')",
      "a:has-text('Sign in')",
      "a:has-text('Log in')",
      "a[href*='login' i]",
      "[data-automation-id='signInSubmitButton']",
    ],
    text: [/sign in to continue/i, /log in to continue/i, /create an account/i, /already have an account/i, /continue with google/i],
  },
  {
    blocker: "closed_job",
    reason: "closed_job",
    selectors: [],
    text: [
      /job (is )?no longer available/i,
      /position (has been )?closed/i,
      /this posting is no longer/i,
      /no longer accepting applications/i,
      /not accepting applications/i,
      /this job has expired/i,
    ],
  },
  {
    blocker: "unsupported_flow",
    reason: "unsupported_flow",
    selectors: ["iframe[src*='apply']", "iframe[src*='application']"],
    text: [/continue with linkedin/i, /apply with linkedin/i, /please enable cookies/i],
  },
];

async function count(page: any, selector: string) {
  try {
    return await page.locator(selector).count();
  } catch {
    return 0;
  }
}

async function bodyText(page: any) {
  try {
    const locator = page.locator("body");
    return ((await locator.innerText({ timeout: 1_500 })) as string).slice(0, 20_000);
  } catch {
    try {
      return ((await page.content()) as string).replace(/<[^>]+>/g, " ").slice(0, 20_000);
    } catch {
      return "";
    }
  }
}

export async function detectPageBlocker(page: any): Promise<BlockerDetection> {
  const text = await bodyText(page);
  for (const pattern of PATTERNS) {
    for (const selector of pattern.selectors) {
      if ((await count(page, selector)) > 0) {
        return { blocker: pattern.blocker, reason: pattern.reason };
      }
    }
    if (pattern.text.some((regex) => regex.test(text))) {
      return { blocker: pattern.blocker, reason: pattern.reason };
    }
  }
  return { blocker: null, reason: null };
}
