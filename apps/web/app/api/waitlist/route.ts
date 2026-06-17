import { NextResponse } from "next/server";
import { reportError } from "@/lib/observability/report";
import { checkRateLimit, clientIp, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit({
    scope: "waitlist:ip",
    key: clientIp(request),
    ...RATE_LIMITS.waitlist,
  });
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit, "Too many sign-up attempts. Try again shortly.");
  }

  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  if (typeof email !== "string" || email.length > 320 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, message: "Please enter a valid email address." },
      { status: 400 },
    );
  }
  const normalized = email.trim().toLowerCase();

  const supabase = getServiceRoleClient();
  if (!supabase) {
    // Demoable without secrets (design doc §7.2). Make it explicit we didn't persist.
    return NextResponse.json({
      ok: true,
      message: "Thanks! (Demo mode — connect Supabase to persist signups.)",
    });
  }

  const { error } = await supabase.from("waitlist").insert({ email: normalized });

  if (error) {
    // 23505 = unique_violation → already signed up. Treat as success.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, message: "You're already on the list — thanks!" });
    }
    await reportError("waitlist insert failed", error, { emailDomain: normalized.split("@")[1] ?? "" });
    return NextResponse.json(
      { ok: false, message: "Couldn't save your email. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message: "You're on the list — we'll be in touch." });
}
