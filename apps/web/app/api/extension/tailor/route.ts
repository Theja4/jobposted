import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { ExtensionTailorResponse } from "@jobposted/shared";
import { GatewayError, gatewayConfigured } from "@/lib/ai/gateway";
import { requireProApi } from "@/lib/billing/access";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";
import { reportError } from "@/lib/observability/report";
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";
import { renderResumeDocx } from "@/lib/tailor/docx";
import { tailorResume } from "@/lib/tailor/engine";
import { renderResumePdf } from "@/lib/tailor/pdf";
import { loadBaseResume } from "@/lib/tailor/source";

export const runtime = "nodejs";
export const maxDuration = 120;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function fallbackJobKey(jobUrl: string, role: string, company: string) {
  return createHash("sha256").update(`${jobUrl}:${company}:${role}`).digest("hex").slice(0, 32);
}

export async function POST(request: Request) {
  try {
    const auth = await getExtensionAuthContext(request);
    const proGate = await requireProApi(auth.supabase, auth.user.id);
    if (proGate) return proGate;

    const rateLimit = await checkRateLimit({
      scope: "tailor:user",
      key: auth.user.id,
      ...RATE_LIMITS.tailor,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, "Resume tailoring is temporarily rate limited. Try again shortly.");
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const jobDescription = asString(body?.jobDescription);
    const jobId = asString(body?.jobId) || null;
    const applicationId = asString(body?.applicationId) || null;
    const jobUrl = asString(body?.jobUrl);
    const role = asString(body?.role) || "Target role";
    const company = asString(body?.company) || "Target company";

    if (wordCount(jobDescription) < 20) {
      return extensionError("Could not read enough job description text from this page.", 400);
    }
    if (!gatewayConfigured()) {
      return extensionError("Resume tailoring isn't configured yet.", 503);
    }

    const resume = await loadBaseResume(auth.supabase, auth.user.id);
    if (!resume) {
      return extensionError("Add your resume in Setup first.", 400);
    }

    const result = await tailorResume(resume, jobDescription.slice(0, 25_000));
    const storageKey = jobId ?? fallbackJobKey(jobUrl, role, company);
    const pdf = await renderResumePdf(result.resume);
    const storagePath = `${auth.user.id}/tailored/${storageKey}.pdf`;
    const { error: uploadError } = await auth.supabase.storage
      .from("resumes")
      .upload(storagePath, new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
        upsert: true,
        contentType: "application/pdf",
      });
    if (uploadError) {
      await reportError("extension tailored resume upload failed", uploadError, { userId: auth.user.id, jobId });
      return extensionError("Could not save the tailored resume.", 500);
    }

    // Persist the structured resume alongside the PDF so Rezoomed's "Edit" handoff can
    // rebuild it in the builder (both apps share this Supabase project + bucket). Best
    // effort — a failure here only disables Edit, not the PDF/DOCX the user still gets.
    const jsonPath = `${auth.user.id}/tailored/${storageKey}.json`;
    const { error: jsonError } = await auth.supabase.storage
      .from("resumes")
      .upload(jsonPath, new Blob([JSON.stringify(result.resume)], { type: "application/json" }), {
        upsert: true,
        contentType: "application/json",
      });
    if (jsonError) {
      await reportError("extension tailored resume json upload failed", jsonError, { userId: auth.user.id, jobId });
    }

    const { data: existingDoc } = await (jobId
      ? auth.supabase
          .from("documents")
          .select("id")
          .eq("user_id", auth.user.id)
          .eq("job_id", jobId)
          .eq("type", "tailored_resume")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }));

    const docQuery = existingDoc?.id
      ? auth.supabase
          .from("documents")
          .update({ storage_path: storagePath, rezoomed_score: result.analysis.matchScore })
          .eq("id", existingDoc.id)
          .select("id")
          .single()
      : auth.supabase
          .from("documents")
          .insert({
            user_id: auth.user.id,
            job_id: jobId,
            type: "tailored_resume",
            storage_path: storagePath,
            rezoomed_score: result.analysis.matchScore,
          })
          .select("id")
          .single();
    const { data: doc, error: docError } = await docQuery;
    if (docError) {
      await reportError("extension tailored resume document upsert failed", docError, { userId: auth.user.id, jobId });
    }

    if (jobId) {
      const { error: pinError } = await auth.supabase
        .from("applications")
        .update({ rendered_pdf_path: storagePath, resume_doc_id: doc?.id ?? null })
        .eq("user_id", auth.user.id)
        .eq("job_id", jobId);
      if (pinError) {
        await reportError("extension tailored resume application pin failed", pinError, { userId: auth.user.id, jobId });
      }
    }

    const { data: signed } = await auth.supabase.storage.from("resumes").createSignedUrl(storagePath, 600);
    let resumeDocxUrl: string | null = null;
    try {
      const docx = await renderResumeDocx(result.resume);
      const docxPath = `${auth.user.id}/tailored/${storageKey}.docx`;
      const { error: docxError } = await auth.supabase.storage
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
      if (!docxError) {
        const { data: signedDocx } = await auth.supabase.storage.from("resumes").createSignedUrl(docxPath, 600);
        resumeDocxUrl = signedDocx?.signedUrl ?? null;
      }
    } catch (error) {
      await reportError("extension tailored resume docx render failed", error, { userId: auth.user.id, jobId });
    }

    const response: ExtensionTailorResponse = {
      ok: true,
      kind: "tailor",
      jobId,
      applicationId,
      docId: doc?.id ?? null,
      resumeUrl: signed?.signedUrl ?? null,
      resumeDocxUrl,
      matchScore: result.analysis.matchScore,
      changed: result.changed,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof GatewayError) {
      await reportError("extension tailor gateway error", error);
      return extensionError("The tailoring engine is busy. Try again shortly.", 502);
    }
    return authErrorResponse(error);
  }
}
