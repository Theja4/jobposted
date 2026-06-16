import { NextResponse } from "next/server";
import { reportError } from "@/lib/observability/report";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const path = url.searchParams.get("path")?.trim();
  if (!path || !path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ ok: false, error: "invalid_path" }, { status: 400 });
  }

  const { data, error } = await supabase.storage.from("resumes").createSignedUrl(path, 600);
  if (error) {
    await reportError("resume signed url failed", error, { userId: user.id });
    return NextResponse.json({ ok: false, error: "sign_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: data?.signedUrl ?? null });
}
