import type { Page } from "playwright";

/**
 * Detect a CAPTCHA / Cloudflare challenge (design doc §11.4). We never attempt to solve these —
 * the application is routed to the extension path or manual apply instead.
 */
export async function detectChallenge(page: Page): Promise<string | null> {
  const url = page.url();
  if (/challenges\.cloudflare\.com|__cf_chl|\/cdn-cgi\/challenge/i.test(url)) {
    return "cloudflare_challenge";
  }
  // No named nested functions here — tsx/esbuild's keepNames wraps them with a __name helper
  // that isn't defined inside page.evaluate. Anonymous arrows + inline expressions are safe.
  return page.evaluate(() => {
    const frames = Array.from(document.querySelectorAll("iframe")).map((f) => f.src || "");
    if (frames.some((s) => /recaptcha\/api2|recaptcha\/enterprise/i.test(s))) return "recaptcha";
    if (frames.some((s) => /hcaptcha\.com/i.test(s))) return "hcaptcha";
    if (frames.some((s) => /challenges\.cloudflare\.com/i.test(s))) return "cloudflare_turnstile";
    const text = document.body?.innerText ?? "";
    if (/verify you are human|checking your browser|are you a robot/i.test(text)) {
      return "challenge_text";
    }
    return null;
  });
}
