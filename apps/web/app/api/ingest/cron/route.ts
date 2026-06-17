import { NextResponse } from "next/server";
import { cronHandler } from "@jobposted/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const auth = request.headers.get("authorization");
  const secrets = [
    process.env.CRON_SECRET,
    process.env.INGEST_CRON_SECRET,
    process.env.WORKER_CRON_SECRET,
  ].filter(Boolean);
  return secrets.some((secret) => auth === `Bearer ${secret}`);
}

async function handleCron(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const response = await cronHandler();
    const body = await response.json().catch(() => null);
    return NextResponse.json({ ok: true, ingest: body }, { status: response.status });
  } catch (error) {
    console.error("ingest cron failed", error);
    return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 500 });
  }
}

export const GET = handleCron;
export const POST = handleCron;
