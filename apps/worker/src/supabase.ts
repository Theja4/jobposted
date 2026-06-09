import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

const makeClient = () =>
  createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "jobposted" },
  });

let client: ReturnType<typeof makeClient> | null = null;

/** Service-role client scoped to the `jobposted` schema (bypasses RLS — server only). */
export function db() {
  if (!client) client = makeClient();
  return client;
}
