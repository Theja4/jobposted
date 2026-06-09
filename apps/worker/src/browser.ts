import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { config } from "./config";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: config.headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }
  return browser;
}

/**
 * A fresh, stealthed context (design doc §11.5). Per-user residential proxy when configured;
 * realistic UA/viewport/locale; navigator.webdriver masked.
 */
export async function newContext(proxyUrl?: string): Promise<BrowserContext> {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
    ...(proxyUrl ?? config.proxyUrl ? { proxy: { server: (proxyUrl ?? config.proxyUrl)! } } : {}),
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    // tsx/esbuild's keepNames injects __name into page.evaluate'd code; shim it in the page.
    const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
    g.__name = g.__name ?? ((fn: unknown) => fn);
  });
  return context;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}

// ── Human pacing (design doc §11.5) ──────────────────────────────────────────

const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const pause = (ms: number): Promise<void> =>
  new Promise<void>((r) => setTimeout(r, ms));

/** Randomized think-time between actions. */
export function thinkTime(): Promise<void> {
  return pause(rand(350, 1100));
}

/** Type into a locator one character at a time with human-ish delays. */
export async function humanType(locator: Locator, text: string): Promise<void> {
  await locator.click();
  await locator.fill("");
  for (const ch of text) {
    await locator.press(ch === " " ? "Space" : ch.length === 1 ? ch : "");
    await pause(rand(25, 90));
  }
  // Fallback if per-key press misbehaves on some inputs.
  const current = await locator.inputValue().catch(() => "");
  if (current !== text) await locator.fill(text);
}

export async function humanClick(page: Page, locator: Locator): Promise<void> {
  await thinkTime();
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click();
}
