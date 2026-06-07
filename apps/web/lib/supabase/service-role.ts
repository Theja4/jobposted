import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service role key. Bypasses RLS (design doc §8.1) —
 * NEVER import this into client code. Scoped to the `jobposted` Postgres schema so
 * `.from("waitlist")` resolves to `jobposted.waitlist`.
 *
 * Returns null when env is absent so callers can degrade gracefully (e.g. the waitlist
 * endpoint replies "coming soon" instead of crashing during local dev without secrets).
 */
export function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "jobposted" },
  });
}
