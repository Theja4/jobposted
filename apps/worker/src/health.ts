export type WorkerEnv = {
  JOBPOSTED_WEB_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  WORKER_CRON_SECRET?: string;
  SENTRY_DSN?: string;
  ERROR_REPORTING_WEBHOOK_URL?: string;
};

export function workerHealth(env: WorkerEnv = process.env) {
  const webUrl = env.JOBPOSTED_WEB_URL || env.NEXT_PUBLIC_SITE_URL;
  const missing = [
    ["JOBPOSTED_WEB_URL or NEXT_PUBLIC_SITE_URL", webUrl],
    ["NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    ok: missing.length === 0,
    service: "jobposted-worker",
    missing,
    sentry: Boolean(env.SENTRY_DSN),
    errorWebhook: Boolean(env.ERROR_REPORTING_WEBHOOK_URL),
    cronProtected: Boolean(env.WORKER_CRON_SECRET),
  };
}

export function cronAuthorized(authHeader: string | null, env: WorkerEnv = process.env) {
  const secret = env.WORKER_CRON_SECRET;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}
