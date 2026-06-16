import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { embedResumeContent, vectorToSql } from "@/lib/ai/embeddings";
import { reportError } from "@/lib/observability/report";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  mergeResumeSourceDocument,
  rec,
  resumeContentFromProfilePayload,
  type ProfilePayload,
  type SourceDocument,
} from "@/lib/profile/resume-version";

export const runtime = "nodejs";

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

function extFor(type: string, name: string) {
  if (type === "application/pdf") return "pdf";
  if (name.toLowerCase().endsWith(".docx")) return "docx";
  if (name.toLowerCase().endsWith(".doc")) return "doc";
  return "pdf";
}

function hashBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function removeUploadedResume(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  path: string,
  userId: string,
  reason: string,
) {
  const { error } = await supabase.storage.from("resumes").remove([path]);
  if (error) {
    await reportError("base resume cleanup failed", error, { userId, path, reason });
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large", message: "Max 6 MB." }, { status: 400 });
  }
  if (file.type && !ALLOWED.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: "bad_type", message: "Upload a PDF or Word document." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const contentHash = hashBuffer(bytes);
  const profileSnapshot = form?.get("profile");
  const hasProfileSnapshot = typeof profileSnapshot === "string" && profileSnapshot.trim().length > 0;

  if (!hasProfileSnapshot) {
    const { data: latestVersion } = await supabase
      .from("resume_base_versions")
      .select("id,storage_path,content_hash")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVersion?.content_hash === contentHash && latestVersion.storage_path) {
      await supabase
        .from("profiles")
        .upsert(
          { id: user.id, email: user.email ?? null, active_resume_version_id: latestVersion.id },
          { onConflict: "id" },
        );
      const { data: signed } = await supabase.storage
        .from("resumes")
        .createSignedUrl(latestVersion.storage_path, 600);
      return NextResponse.json({
        ok: true,
        duplicate: true,
        path: latestVersion.storage_path,
        url: signed?.signedUrl ?? null,
        name: file.name,
        versionId: latestVersion.id,
        documentId: null,
      });
    }
  }

  const versionId = randomUUID();
  // Storage RLS requires the first path segment to be the owner's uid.
  const path = `${user.id}/base/${versionId}.${extFor(file.type, file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(path, bytes, { upsert: false, contentType: file.type || "application/pdf" });
  if (uploadError) {
    await reportError("base resume upload failed", uploadError, { userId: user.id });
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }

  const sourceDocument: SourceDocument = {
    name: file.name,
    storagePath: path,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
    contentHash,
  };

  let content: Record<string, unknown>;
  if (hasProfileSnapshot) {
    let parsed: ProfilePayload;
    try {
      parsed = JSON.parse(profileSnapshot as string) as ProfilePayload;
    } catch {
      await removeUploadedResume(supabase, path, user.id, "bad_profile_snapshot");
      return NextResponse.json({ ok: false, error: "bad_profile_snapshot" }, { status: 400 });
    }
    content = resumeContentFromProfilePayload(parsed, sourceDocument);
  } else {
    const { data: latestVersion } = await supabase
      .from("resume_base_versions")
      .select("content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    content = mergeResumeSourceDocument(rec(latestVersion).content, sourceDocument);
  }

  const embedding = await embedResumeContent(content).catch(async (error) => {
    await reportError("base resume embedding failed", error, { userId: user.id });
    return null;
  });

  const { data: version, error: versionError } = await supabase
    .from("resume_base_versions")
    .insert({
      id: versionId,
      user_id: user.id,
      content,
      storage_path: path,
      source_document: sourceDocument,
      content_hash: contentHash,
      embedding: vectorToSql(embedding),
    })
    .select("id")
    .single();
  if (versionError) {
    await reportError("base resume version insert failed", versionError, { userId: user.id });
    await removeUploadedResume(supabase, path, user.id, "version_failed");
    return NextResponse.json({ ok: false, error: "version_failed" }, { status: 500 });
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, email: user.email ?? null, active_resume_version_id: version?.id ?? versionId },
      { onConflict: "id" },
    );
  if (profileError) {
    await reportError("base resume profile pointer update failed", profileError, { userId: user.id, versionId: version?.id ?? versionId });
  }

  const { data: document, error: documentError } = await supabase.from("documents").insert({
    user_id: user.id,
    type: "base_resume",
    storage_path: path,
  }).select("id").single();
  if (documentError) {
    await reportError("base resume document insert failed", documentError, { userId: user.id });
  }

  const { data: signed } = await supabase.storage.from("resumes").createSignedUrl(path, 600);

  return NextResponse.json({
    ok: true,
    path,
    url: signed?.signedUrl ?? null,
    name: file.name,
    versionId: version?.id ?? null,
    documentId: document?.id ?? null,
  });
}
