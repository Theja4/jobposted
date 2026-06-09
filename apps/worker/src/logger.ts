import * as Sentry from "@sentry/node";
import { config } from "./config";

let sentryReady = false;

export function initObservability(): void {
  if (config.sentryDsn && !sentryReady) {
    Sentry.init({ dsn: config.sentryDsn, tracesSampleRate: 0 });
    sentryReady = true;
  }
}

function stamp() {
  return new Date().toISOString();
}

export const log = {
  info(msg: string, meta?: Record<string, unknown>) {
    console.info(`${stamp()} INFO  ${msg}`, meta ? JSON.stringify(meta) : "");
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    console.warn(`${stamp()} WARN  ${msg}`, meta ? JSON.stringify(meta) : "");
  },
  error(msg: string, err?: unknown, meta?: Record<string, unknown>) {
    console.error(`${stamp()} ERROR ${msg}`, err instanceof Error ? err.stack : err, meta ?? "");
    if (sentryReady) {
      Sentry.captureException(err instanceof Error ? err : new Error(msg), { extra: meta });
    }
  },
};
