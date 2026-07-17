import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Learn more" entry point from the pricing page's Rezoomed Pro card.
 * Signed-in users go straight to the upgrade-to-Pro page; everyone else is
 * sent to sign in and returned to /pricing afterwards.
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const destination = user
    ? "/dashboard/pricing"
    : "/get-started?mode=signin&next=/pricing";

  return NextResponse.redirect(new URL(destination, request.url));
}
