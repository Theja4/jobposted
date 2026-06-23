import { NextResponse } from "next/server";
import type { ExtensionResumeResponse } from "@jobposted/shared";
import { authErrorResponse, getExtensionAuthContext } from "@/lib/extension/auth";
import { findResumeDocuments, signedResumeUrl } from "@/lib/extension/resume";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    const { supabase, user } = await getExtensionAuthContext(request);
    const docs = await findResumeDocuments({ supabase, userId: user.id, jobId });
    const [resumeUrl, coverLetterUrl] = await Promise.all([
      signedResumeUrl(supabase, docs.resume?.storage_path),
      signedResumeUrl(supabase, docs.coverLetter?.storage_path),
    ]);

    const body: ExtensionResumeResponse = {
      ok: true,
      jobId,
      documentId: docs.resume?.id ?? null,
      resumeUrl,
      resumeName: docs.resume?.display_name ?? null,
      coverLetterUrl,
      coverLetterName: docs.coverLetter?.display_name ?? null,
      genericResumeUsed: docs.genericResumeUsed,
      expiresAt: resumeUrl ? new Date(Date.now() + 300_000).toISOString() : null,
    };
    return NextResponse.json(body);
  } catch (error) {
    return authErrorResponse(error);
  }
}
