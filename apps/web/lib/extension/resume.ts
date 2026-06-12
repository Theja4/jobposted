import type { SupabaseClient } from "@supabase/supabase-js";

type DocumentRow = {
  id: string;
  storage_path: string | null;
  type: string | null;
  job_id: string | null;
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

  const { data: base } = await supabase
    .from("documents")
    .select("id,storage_path,type,job_id,created_at")
    .eq("user_id", userId)
    .eq("type", "base_resume")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DocumentRow>();

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
