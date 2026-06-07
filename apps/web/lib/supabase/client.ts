import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (anon key). Every request is constrained by RLS, so a user only
 * sees their own rows. Scoped to the `jobposted` schema. Used by the authenticated portal
 * (Phase 2); not needed to render the marketing landing page.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { db: { schema: "jobposted" } },
  );
}
