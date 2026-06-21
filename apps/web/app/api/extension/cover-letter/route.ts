import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { ExtensionCoverLetterResponse, ResumeContent } from "@jobposted/shared";
import { GatewayError, callGatewayJSON, gatewayConfigured } from "@/lib/ai/gateway";
import { requireProApi } from "@/lib/billing/access";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";
import { reportError } from "@/lib/observability/report";
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";
import { loadBaseResume } from "@/lib/tailor/source";

export const runtime = "nodejs";
export const maxDuration = 90;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function fallbackJobKey(jobUrl: string, role: string, company: string) {
  return createHash("sha256").update(`${jobUrl}:${company}:${role}`).digest("hex").slice(0, 32);
}

function resumeForPrompt(resume: ResumeContent) {
  return {
    headline: resume.headline,
    summary: resume.summary,
    skills: resume.skills,
    experience: resume.experience.map((item) => ({
      company: item.company,
      title: item.title,
      current: item.current,
      startDate: item.startDate,
      endDate: item.endDate,
      bullets: item.bullets,
    })),
    education: resume.education.map((item) => ({
      school: item.school,
      degree: item.degree,
      field: item.field,
    })),
    projects: resume.projects.map((item) => ({
      name: item.name,
      description: item.description,
      bullets: item.bullets ?? [],
      technologies: item.technologies ?? [],
    })),
  };
}

type CoverLetterResult = {
  coverLetter?: string;
};

async function generateCoverLetter(args: {
  resume: ResumeContent;
  company: string;
  role: string;
  jobDescription: string;
}) {
  const result = await callGatewayJSON<CoverLetterResult>({
    maxTokens: 1800,
    timeoutMs: 75_000,
    system: `You write concise, truthful cover letters for job applications.

Rules:
- Do not invent employers, titles, metrics, technologies, education, or authorization.
- Use only evidence from the resume.
- Keep it 250-380 words.
- Address the company and role directly.
- Return ONLY valid JSON: {"coverLetter":"..."}.`,
    user: `<job>
Company: ${args.company}
Role: ${args.role}
Description:
${args.jobDescription.slice(0, 16_000)}
</job>

<resume>
${JSON.stringify(resumeForPrompt(args.resume), null, 2)}
</resume>`,
  });
  return asString(result.coverLetter);
}

export async function POST(request: Request) {
  try {
    const auth = await getExtensionAuthContext(request);
    const proGate = await requireProApi(auth.supabase, auth.user.id);
    if (proGate) return proGate;

    const rateLimit = await checkRateLimit({
      scope: "cover-letter:user",
      key: auth.user.id,
      ...RATE_LIMITS.tailor,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, "Cover letter generation is temporarily rate limited. Try again shortly.");
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
      return extensionError("Cover letter generation isn't configured yet.", 503);
    }

    const resume = await loadBaseResume(auth.supabase, auth.user.id);
    if (!resume) {
      return extensionError("Add your resume in Setup first.", 400);
    }

    const coverLetter = await generateCoverLetter({ resume, company, role, jobDescription });
    if (wordCount(coverLetter) < 80) {
      return extensionError("The cover letter generator returned too little content. Try again.", 502);
    }

    const storageKey = jobId ?? fallbackJobKey(jobUrl, role, company);
    const storagePath = `${auth.user.id}/cover-letters/${storageKey}.txt`;
    const { error: uploadError } = await auth.supabase.storage
      .from("resumes")
      .upload(storagePath, new Blob([coverLetter], { type: "text/plain;charset=utf-8" }), {
        upsert: true,
        contentType: "text/plain;charset=utf-8",
      });
    if (uploadError) {
      await reportError("extension cover letter upload failed", uploadError, { userId: auth.user.id, jobId });
      return extensionError("Could not save the cover letter.", 500);
    }

    const { data: existingDoc } = await (jobId
      ? auth.supabase
          .from("documents")
          .select("id")
          .eq("user_id", auth.user.id)
          .eq("job_id", jobId)
          .eq("type", "cover_letter")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }));
    const docQuery = existingDoc?.id
      ? auth.supabase.from("documents").update({ storage_path: storagePath }).eq("id", existingDoc.id).select("id").single()
      : auth.supabase
          .from("documents")
          .insert({
            user_id: auth.user.id,
            job_id: jobId,
            type: "cover_letter",
            storage_path: storagePath,
          })
          .select("id")
          .single();
    const { data: doc, error: docError } = await docQuery;
    if (docError) {
      await reportError("extension cover letter document upsert failed", docError, { userId: auth.user.id, jobId });
    }

    if (jobId && doc?.id) {
      const { error: pinError } = await auth.supabase
        .from("applications")
        .update({ cover_letter_doc_id: doc.id })
        .eq("user_id", auth.user.id)
        .eq("job_id", jobId);
      if (pinError) {
        await reportError("extension cover letter application pin failed", pinError, { userId: auth.user.id, jobId });
      }
    }

    const { data: signed } = await auth.supabase.storage.from("resumes").createSignedUrl(storagePath, 600);
    const response: ExtensionCoverLetterResponse = {
      ok: true,
      kind: "cover_letter",
      jobId,
      applicationId,
      documentId: doc?.id ?? null,
      coverLetterUrl: signed?.signedUrl ?? null,
      preview: coverLetter.slice(0, 240),
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof GatewayError) {
      await reportError("extension cover letter gateway error", error);
      return extensionError("The cover letter generator is busy. Try again shortly.", 502);
    }
    return authErrorResponse(error);
  }
}
