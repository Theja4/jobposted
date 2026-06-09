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
  return page.evaluate(() => {
    const hasFrame = (re: RegExp) =>
      Array.from(document.querySelectorAll("iframe")).some((f) => re.test(f.src || ""));
    if (hasFrame(/recaptcha\/api2|recaptcha\/enterprise/i)) return "recaptcha";
    if (hasFrame(/hcaptcha\.com/i)) return "hcaptcha";
    if (hasFrame(/challenges\.cloudflare\.com/i)) return "cloudflare_turnstile";
    const text = document.body?.innerText ?? "";
    if (/verify you are human|checking your browser|are you a robot/i.test(text)) {
      return "challenge_text";
    }
    return null;
  });
}
