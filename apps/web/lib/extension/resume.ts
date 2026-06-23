import type { SupabaseClient } from "@supabase/supabase-js";

type DocumentRow = {
  id: string;
  storage_path: string | null;
  type: string | null;
  job_id: string | null;
  created_at: string | null;
};

type SourceDocument = {
  name?: string | null;
};

type ResumeVersionRow = {
  id: string;
  storage_path: string | null;
  created_at: string | null;
  source_document?: SourceDocument | null;
  content?: unknown;
};

export type ExtensionDocumentRef = DocumentRow & {
  display_name?: string | null;
};

export type ExtensionResumeDocuments = {
  resume: ExtensionDocumentRef | null;
  coverLetter: ExtensionDocumentRef | null;
  genericResumeUsed: boolean;
};

export function isProbablyUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sourceDocumentName(version: Pick<ResumeVersionRow, "source_document" | "content"> | null | undefined) {
  const direct = asString(version?.source_document?.name);
  if (direct) return direct;
  const sourceDocument = asRecord(asRecord(version?.content).sourceDocument);
  return asString(sourceDocument.name) || null;
}

async function latestOnboardingResumeName(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("onboarding_configurations")
    .select("data,completed_at,updated_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const profile = asRecord(asRecord(data).data).profile;
  const profileRecord = asRecord(profile);
  const resumeSource = asRecord(profileRecord.resumeSource);
  return asString(profileRecord.resumeName) || asString(resumeSource.name) || null;
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
}): Promise<ExtensionResumeDocuments> {
  const { supabase, userId, jobId } = args;
  let tailored: ExtensionDocumentRef | null = null;
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

  let base: ExtensionDocumentRef | null = null;
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
      .select("id,storage_path,created_at,source_document,content")
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
      base.display_name = sourceDocumentName(version);
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
    if (base?.storage_path) {
      const { data: version } = await supabase
        .from("resume_base_versions")
        .select("source_document,content")
        .eq("user_id", userId)
        .eq("storage_path", base.storage_path)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<ResumeVersionRow, "source_document" | "content">>();
      base.display_name = sourceDocumentName(version);
    }
  }

  if (base && !base.display_name) {
    base.display_name = await latestOnboardingResumeName(supabase, userId);
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
