import { NextResponse } from "next/server";
import { countBoards, loadBoardConfig } from "@jobposted/ingest";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { hasTenureCreemProduct } from "@/lib/billing/creem";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

async function databaseStatus() {
  const client = getServiceRoleClient();
  if (!client) return "not_configured" as const;
  const { error } = await client.from("jobs").select("id", { head: true, count: "exact" }).limit(1);
  return error ? ("unavailable" as const) : ("ok" as const);
}

async function ingestBoardStatus() {
  try {
    const config = await loadBoardConfig();
    return countBoards(config);
  } catch {
    return -1;
  }
}

export async function GET() {
  const production = process.env.NODE_ENV === "production";
  const ingestBoardCount = await ingestBoardStatus();
  const checks = {
    environment: process.env.NODE_ENV ?? "unknown",
    siteUrl: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    workerCronProtected: Boolean(process.env.WORKER_CRON_SECRET),
    vercelCronSecret: Boolean(process.env.CRON_SECRET),
    ingestCronProtected: Boolean(process.env.CRON_SECRET || process.env.INGEST_CRON_SECRET || process.env.WORKER_CRON_SECRET),
    ingestBoardsConfigured: ingestBoardCount > 0,
    ingestBoardCount,
    billingWebhookSecret: Boolean(process.env.BILLING_WEBHOOK_SECRET || process.env.CREEM_WEBHOOK_SECRET),
    creemApiKey: Boolean(process.env.CREEM_API_KEY),
    creemMonthlyProduct: hasTenureCreemProduct("monthly"),
    creemQuarterlyProduct: hasTenureCreemProduct("quarterly"),
    aiProvider: gatewayConfigured(),
    aiGateway: gatewayConfigured(),
    database: await databaseStatus(),
  };
  const ok =
    checks.siteUrl &&
    checks.supabaseUrl &&
    checks.supabaseAnonKey &&
    checks.serviceRole &&
    checks.workerCronProtected &&
    checks.ingestCronProtected &&
    checks.ingestBoardsConfigured &&
    checks.database === "ok";
  const productionOk =
    ok &&
    checks.billingWebhookSecret &&
    checks.creemApiKey &&
    checks.creemMonthlyProduct &&
    checks.creemQuarterlyProduct &&
    checks.aiProvider;

  return NextResponse.json(
    {
      ok: production ? productionOk : ok,
      service: "jobposted-web",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: (production ? productionOk : ok) ? 200 : 503 },
  );
}
