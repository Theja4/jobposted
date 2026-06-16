import { NextResponse } from "next/server";
import {
  prepareDailyApplicationsForAllUsers,
  prepareDailyApplicationsForUser,
} from "@/lib/apply/matcher";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function positiveIntFromBody(value: unknown, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(max, Math.floor(value));
}

function cronAuthorized(request: Request) {
  const secret = process.env.WORKER_CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (cronAuthorized(request)) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const options = {
      dailyLimit: positiveIntFromBody(body?.dailyLimit, 50),
      candidateLimit: positiveIntFromBody(body?.candidateLimit, 1000),
      userLimit: positiveIntFromBody(body?.userLimit, 5000),
    };
    const service = getServiceRoleClient();
    if (!service) {
      return NextResponse.json({ ok: false, error: "service_role_unavailable" }, { status: 503 });
    }
    try {
      const result = await prepareDailyApplicationsForAllUsers(service, options);
      return NextResponse.json(result);
    } catch (error) {
      console.error("queue prepare cron failed", error);
      return NextResponse.json({ ok: false, error: "prepare_failed" }, { status: 500 });
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await prepareDailyApplicationsForUser(supabase, user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("queue prepare failed", error);
    return NextResponse.json({ ok: false, error: "prepare_failed" }, { status: 500 });
  }
}
