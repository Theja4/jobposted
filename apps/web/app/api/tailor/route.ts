import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gatewayConfigured, GatewayError } from "@/lib/ai/gateway";
import { loadBaseResume } from "@/lib/tailor/source";
import { tailorResume } from "@/lib/tailor/engine";
import { renderResumePdf } from "@/lib/tailor/pdf";
import { renderResumeDocx } from "@/lib/tailor/docx";
import { reportError } from "@/lib/observability/report";
import { requireProApi } from "@/lib/billing/access";
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const proGate = await requireProApi(supabase, user.id);
  if (proGate) return proGate;

  const rateLimit = await checkRateLimit({
    scope: "tailor:user",
    key: user.id,
    ...RATE_LIMITS.tailor,
  });
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit, "Resume tailoring is temporarily rate limited. Try again shortly.");
  }

  const body = (await request.json().catch(() => null)) as {
    jobId?: string;
    jobDescription?: string;
    save?: boolean;
  } | null;

  const resume = await loadBaseResume(supabase, user.id);
  if (!resume) {
    return NextResponse.json(
      { ok: false, error: "no_base_resume", message: "Add your resume in Setup first." },
      { status: 400 },
    );
  }

  if (!gatewayConfigured()) {
    return NextResponse.json(
      { ok: false, error: "tailoring_unavailable", message: "Resume tailoring isn't configured yet." },
      { status: 503 },
    );
  }

  // Resolve the job description: explicit text, or the stored job's description.
  let jobDescription = (body?.jobDescription ?? "").trim();
  const jobId = body?.jobId?.trim() || null;
  if (!jobDescription && jobId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("description_md,title,company")
      .eq("id", jobId)
      .maybeSingle();
    jobDescription = typeof job?.description_md === "string" ? job.description_md : "";
  }

  if (wordCount(jobDescription) < 20) {
    return NextResponse.json(
      { ok: false, error: "job_description_too_short", message: "Paste at least the full role requirements (20+ words)." },
      { status: 400 },
    );
  }

  try {
    const result = await tailorResume(resume, jobDescription.slice(0, 25000));

    let resumeUrl: string | null = null;
    let resumeDocxUrl: string | null = null;
    let documentId: string | null = null;

    if (body?.save && jobId) {
      const pdf = await renderResumePdf(result.resume);
      // Storage RLS requires the first path segment to be the owner's uid.
      const storagePath = `${user.id}/tailored/${jobId}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(storagePath, new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
          upsert: true,
          contentType: "application/pdf",
        });
      if (uploadError) {
        await reportError("tailored resume upload failed", uploadError, { userId: user.id, jobId });
      } else {
        const { data: existingDoc } = await supabase
          .from("documents")
          .select("id")
          .eq("user_id", user.id)
          .eq("job_id", jobId)
          .eq("type", "tailored_resume")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const docQuery = existingDoc?.id
          ? supabase
              .from("documents")
              .update({ storage_path: storagePath, rezoomed_score: result.analysis.matchScore })
              .eq("id", existingDoc.id)
              .select("id")
              .single()
          : supabase
              .from("documents")
              .insert({
            user_id: user.id,
            job_id: jobId,
            type: "tailored_resume",
            storage_path: storagePath,
            rezoomed_score: result.analysis.matchScore,
          })
              .select("id")
              .single();
        const { data: doc, error: docError } = await docQuery;
        if (docError) {
          await reportError("tailored resume document upsert failed", docError, { userId: user.id, jobId });
        }
        documentId = doc?.id ?? null;
        const { data: signed } = await supabase.storage
          .from("resumes")
          .createSignedUrl(storagePath, 600);
        resumeUrl = signed?.signedUrl ?? null;

        // Pin this exact artifact onto the application so history shows what was sent.
        const { error: pinError } = await supabase
          .from("applications")
          .update({ rendered_pdf_path: storagePath, resume_doc_id: documentId })
          .eq("user_id", user.id)
          .eq("job_id", jobId);
        if (pinError) {
          await reportError("tailored resume application pin failed", pinError, { userId: user.id, jobId });
        }

        // Also offer an editable .docx download (Word reflows; not the canonical sent artifact).
        try {
          const docx = await renderResumeDocx(result.resume);
          const docxPath = `${user.id}/tailored/${jobId}.docx`;
          const { error: docxError } = await supabase.storage
            .from("resumes")
            .upload(
              docxPath,
              new Blob([new Uint8Array(docx)], {
                type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              }),
              {
                upsert: true,
                contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              },
            );
          if (docxError) {
            await reportError("tailored resume docx upload failed", docxError, { userId: user.id, jobId });
          } else {
            const { data: signedDocx } = await supabase.storage.from("resumes").createSignedUrl(docxPath, 600);
            resumeDocxUrl = signedDocx?.signedUrl ?? null;
          }
        } catch (docxErr) {
          await reportError("tailored resume docx render failed", docxErr, { userId: user.id, jobId });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      changed: result.changed,
      analysis: result.analysis,
      resume: result.resume,
      documentId,
      resumeUrl,
      resumeDocxUrl,
    });
  } catch (error) {
    if (error instanceof GatewayError) {
      await reportError("tailor gateway error", error, { userId: user.id, jobId });
      return NextResponse.json(
        { ok: false, error: "tailoring_failed", message: "The tailoring engine is busy. Try again shortly." },
        { status: 502 },
      );
    }
    await reportError("tailor route error", error, { userId: user.id, jobId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
