import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { sendEmail } from "@/lib/email/resend";
import { submissionEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

interface AppRow {
  user_id: string;
  jobs: { title: string | null; company: string | null } | null;
}

/** Send a submission-confirmation email. Called by the worker (service-token) after submit. */
export async function POST(request: Request) {
  const token = process.env.EMAIL_SERVICE_TOKEN;
  if (!token || request.headers.get("x-service-token") !== token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let applicationId: unknown;
  try {
    ({ applicationId } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  if (typeof applicationId !== "string") {
    return NextResponse.json({ ok: false, error: "Missing applicationId" }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 500 });

  const { data: app } = await admin
    .from("applications")
    .select("user_id, jobs(title, company)")
    .eq("id", applicationId)
    .maybeSingle<AppRow>();
  if (!app) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", app.user_id)
    .maybeSingle();
  const to = profile?.email as string | undefined;
  if (to) {
    const { subject, html } = submissionEmail({
      title: app.jobs?.title ?? "a role",
      company: app.jobs?.company ?? "the company",
    });
    await sendEmail({ to, subject, html });
  }
  return NextResponse.json({ ok: true });
}
