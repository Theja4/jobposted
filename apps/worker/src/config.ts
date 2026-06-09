/** Worker configuration from the environment. */
export const config = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  proxyUrl: process.env.BROWSER_PROXY_URL || undefined,
  sentryDsn: process.env.SENTRY_DSN || undefined,
  pollMs: Number(process.env.WORKER_POLL_MS ?? 5000),
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  headless: process.env.WORKER_HEADLESS !== "false",
  dailyCeiling: Number(process.env.DAILY_CEILING_DIRECT_ATS ?? 100),
};

export function assertConfigured(): void {
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    throw new Error(
      "Worker needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).",
    );
  }
}
