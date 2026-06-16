/* eslint-disable @typescript-eslint/no-explicit-any */

/** A minimal browser session the runner needs. Keeps the orchestrator decoupled from Playwright. */
export interface BrowserSession {
  newPage(): Promise<any>;
  close(): Promise<void>;
}

export type LaunchBrowser = () => Promise<BrowserSession>;

/**
 * Launch headless Chromium via Playwright. Imported lazily so the worker can serve /health and the
 * queue cron in environments where the browser binary isn't installed — only the apply runner path
 * pulls Playwright in.
 */
export async function launchPlaywright(): Promise<BrowserSession> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1600 },
  });
  return {
    async newPage() {
      return context.newPage();
    },
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}
