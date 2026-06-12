import { NextResponse } from "next/server";
import { buildMasterProfile } from "@/lib/extension/profile";
import { findResumeDocuments, signedResumeUrl } from "@/lib/extension/resume";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getExtensionAuthContext(request);

    const [
      { data: profileRow, error: profileError },
      { data: resumeBase },
      { data: answerRows },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("resume_base_versions")
        .select("content,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profile_answers")
        .select("key,prompt,value")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
    ]);

    if (profileError) {
      console.error("extension profile fetch failed", profileError);
      return extensionError("Could not load your JobPosted profile.", 500);
    }

    const docs = await findResumeDocuments({ supabase, userId: user.id });
    const [resumeUrl, coverLetterUrl] = await Promise.all([
      signedResumeUrl(supabase, docs.resume?.storage_path),
      signedResumeUrl(supabase, docs.coverLetter?.storage_path),
    ]);

    const profile = buildMasterProfile({
      authEmail: user.email,
      profileRow: profileRow ?? null,
      resumeContent:
        resumeBase && typeof resumeBase === "object" && "content" in resumeBase
          ? resumeBase.content
          : null,
      answers: Array.isArray(answerRows) ? answerRows : [],
      resumeUrl,
      coverLetterUrl,
    });

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return authErrorResponse(error);
  }
}
