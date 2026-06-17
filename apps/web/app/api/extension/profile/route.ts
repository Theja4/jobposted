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
      { data: answerRows },
      { data: onboardingRow, error: onboardingError },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("profile_answers")
        .select("key,prompt,value")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase.from("onboarding_configurations").select("data").eq("user_id", user.id).maybeSingle(),
    ]);

    const activeResumeVersionId =
      profileRow &&
      typeof profileRow === "object" &&
      "active_resume_version_id" in profileRow &&
      typeof profileRow.active_resume_version_id === "string"
        ? profileRow.active_resume_version_id
        : "";
    const { data: resumeBase } = await (activeResumeVersionId
      ? supabase
        .from("resume_base_versions")
        .select("content,created_at")
        .eq("user_id", user.id)
        .eq("id", activeResumeVersionId)
        .maybeSingle()
      : supabase
          .from("resume_base_versions")
          .select("content,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle());

    if (profileError) {
      console.error("extension profile fetch failed", profileError);
      return extensionError("Could not load your JobPosted profile.", 500);
    }
    if (onboardingError) {
      console.error("extension onboarding profile fetch failed", onboardingError);
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
      onboardingData:
        onboardingRow && typeof onboardingRow === "object" && "data" in onboardingRow
          ? onboardingRow.data
          : null,
      resumeUrl,
      coverLetterUrl,
    });

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return authErrorResponse(error);
  }
}
