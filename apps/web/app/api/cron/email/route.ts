import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { sendEmail } from "@/lib/email/resend";
import { dailyDigestEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

/**
 * Daily digest (design doc §10.5, §23.8) — wire to Vercel Cron. Sends each user who applied today
 * a one-line summary. CRON_SECRET-guarded. (One-time day-1 nudge needs a sent-log — follow-up.)
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 500 });

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const { data: rows } = await admin
    .from("applications")
    .select("user_id")
    .gte("submitted_at", start.toISOString());

  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    const uid = (r as { user_id: string }).user_id;
    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }

  let sent = 0;
  for (const [userId, count] of counts) {
    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .maybeSingle();
    const to = profile?.email as string | undefined;
    if (!to) continue;
    const firstName = (profile?.full_name as string | undefined)?.split(" ")[0] ?? null;
    const { subject, html } = dailyDigestEmail({ count, firstName });
    if (await sendEmail({ to, subject, html })) sent++;
  }

  return NextResponse.json({ ok: true, recipients: counts.size, sent });
}
