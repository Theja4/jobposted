import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Auth gating. Only the authed surfaces refresh the session; public marketing pages skip it so
 * they stay statically cacheable (a Set-Cookie from the session refresh would force no-store).
 * The onboarding gate (onboarded_at) lives in the dashboard layout, which already loads the
 * profile — keeping a DB read out of middleware.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding");
  const isLogin = pathname === "/login";

  if (!isProtected && !isLogin) return NextResponse.next();

  const { response, user } = await updateSession(request);

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isLogin && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/login"],
};
