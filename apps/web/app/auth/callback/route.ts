import { NextResponse } from "next/server";
import { reportError } from "@/lib/observability/report";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth / PKCE callback for the Supabase web Google flow (the fallback used when no
 * dedicated NEXT_PUBLIC_GOOGLE_CLIENT_ID is set — see components/auth/GoogleSignIn.tsx).
 * Supabase redirects here with a `code`; we exchange it for a session (sets the auth
 * cookies) and forward to `next`. On failure we bounce back to the sign-in screen.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  // Only allow same-origin relative redirects.
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    await reportError("OAuth callback exchange failed", error, { next });
  } else {
    await reportError("OAuth callback missing code", new Error("oauth_code_missing"), { next });
  }

  return NextResponse.redirect(`${origin}/get-started?mode=signin&error=oauth`);
}
