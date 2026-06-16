import type { SupabaseClient } from "@supabase/supabase-js";

type DocumentRow = {
  id: string;
  storage_path: string | null;
  type: string | null;
  job_id: string | null;
  created_at: string | null;
};

type ResumeVersionRow = {
  id: string;
  storage_path: string | null;
  created_at: string | null;
};

export function isProbablyUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export async function signedResumeUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
) {
  if (!storagePath) return null;
  if (isProbablyUrl(storagePath)) return storagePath;
  const { data, error } = await supabase.storage.from("resumes").createSignedUrl(storagePath, 300);
  if (error) {
    console.error("resume signed URL failed", error);
    return null;
  }
  return data.signedUrl;
}

export async function findResumeDocuments(args: {
  supabase: SupabaseClient;
  userId: string;
  jobId?: string | null;
}) {
  const { supabase, userId, jobId } = args;
  let tailored: DocumentRow | null = null;
  if (jobId) {
    const { data } = await supabase
      .from("documents")
      .select("id,storage_path,type,job_id,created_at")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .eq("type", "tailored_resume")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<DocumentRow>();
    tailored = data ?? null;
  }

  let base: DocumentRow | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_resume_version_id")
    .eq("id", userId)
    .maybeSingle();
  const activeResumeVersionId =
    typeof (profile as Record<string, unknown> | null)?.active_resume_version_id === "string"
      ? ((profile as Record<string, unknown>).active_resume_version_id as string)
      : "";

  if (activeResumeVersionId) {
    const { data: version } = await supabase
      .from("resume_base_versions")
      .select("id,storage_path,created_at")
      .eq("user_id", userId)
      .eq("id", activeResumeVersionId)
      .maybeSingle<ResumeVersionRow>();
    if (version?.storage_path) {
      const { data: document } = await supabase
        .from("documents")
        .select("id,storage_path,type,job_id,created_at")
        .eq("user_id", userId)
        .eq("storage_path", version.storage_path)
        .eq("type", "base_resume")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<DocumentRow>();
      base = document ?? {
        id: version.id,
        storage_path: version.storage_path,
        type: "base_resume",
        job_id: null,
        created_at: version.created_at,
      };
    }
  }

  if (!base) {
    const { data } = await supabase
      .from("documents")
      .select("id,storage_path,type,job_id,created_at")
      .eq("user_id", userId)
      .eq("type", "base_resume")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<DocumentRow>();
    base = data ?? null;
  }

  const { data: coverLetter } = await supabase
    .from("documents")
    .select("id,storage_path,type,job_id,created_at")
    .eq("user_id", userId)
    .eq("type", "cover_letter")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DocumentRow>();

  return {
    resume: tailored ?? base ?? null,
    coverLetter: coverLetter ?? null,
    genericResumeUsed: !tailored,
  };
}
