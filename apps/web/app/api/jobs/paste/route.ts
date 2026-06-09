import { NextResponse } from "next/server";
import type { AtsType } from "@jobposted/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** Detect the ATS from a job URL host (design doc §11.6). */
function detectAts(host: string): AtsType {
  if (host.includes("greenhouse.io")) return "greenhouse";
  if (host.includes("lever.co")) return "lever";
  if (host.includes("ashbyhq.com")) return "ashby";
  if (host.includes("myworkdayjobs.com")) return "workday";
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("smartrecruiters.com")) return "smartrecruiters";
  if (host.includes("workable.com")) return "workable";
  return "other";
}

function titleFromUrl(u: URL): string {
  const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
  const readable = decodeURIComponent(seg).replace(/[-_]+/g, " ").replace(/\.(html?|aspx)$/i, "").trim();
  return readable ? readable.slice(0, 120) : `Job at ${u.hostname}`;
}

/**
 * "Paste any job URL" (design doc §10.3): detect the ATS, store a manual job row (service role —
 * jobs writes bypass RLS), and queue an application for the user.
 */
export async function POST(request: Request) {
  let rawUrl: unknown;
  try {
    ({ url: rawUrl } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(String(rawUrl));
    if (!/^https?:$/.test(url.protocol)) throw new Error("bad protocol");
  } catch {
    return NextResponse.json({ ok: false, error: "Enter a valid http(s) URL" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const ats = detectAts(url.hostname);
  const { data: job, error: jobErr } = await admin
    .from("jobs")
    .upsert(
      {
        source: "manual",
        source_job_id: url.toString(),
        ats_type: ats,
        company: url.hostname.replace(/^www\./, ""),
        title: titleFromUrl(url),
        apply_url: url.toString(),
        remote: "unknown",
      },
      { onConflict: "source,source_job_id" },
    )
    .select("id")
    .single();
  if (jobErr || !job) {
    return NextResponse.json({ ok: false, error: jobErr?.message ?? "Save failed" }, { status: 500 });
  }

  const applyPath = ats === "linkedin" || ats === "workday" ? "extension" : "server";
  const { error: appErr } = await admin.from("applications").upsert(
    { user_id: user.id, job_id: job.id, status: "queued", apply_path: applyPath },
    { onConflict: "user_id,job_id", ignoreDuplicates: true },
  );
  if (appErr) {
    return NextResponse.json({ ok: false, error: appErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, jobId: job.id, ats });
}
