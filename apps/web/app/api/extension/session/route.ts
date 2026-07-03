import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extensionError } from "@/lib/extension/auth";
import { checkRateLimit, clientIp, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return extensionError("Supabase is not configured.", 503);
  }

  const rateLimit = await checkRateLimit({
    scope: "extension_session:ip",
    key: clientIp(request),
    ...RATE_LIMITS.extensionSession,
  });
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit, "Extension session refresh is temporarily rate limited. Try again shortly.");
  }

  const body = await request.json().catch(() => null);
  const refreshToken = str((body as { refreshToken?: unknown } | null)?.refreshToken);
  if (!refreshToken) {
    return extensionError("Missing extension refresh session.", 401);
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session) {
    return extensionError("Invalid or expired extension session.", 401);
  }

  return NextResponse.json({
    ok: true,
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: data.session.user
        ? { id: data.session.user.id, email: data.session.user.email ?? null }
        : null,
    },
  });
}
