import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { embedResumeContent, vectorToSql } from "@/lib/ai/embeddings";
import { reportError } from "@/lib/observability/report";
import { requireProApi } from "@/lib/billing/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resumeContentFromProfilePayload, type SourceDocument } from "@/lib/profile/resume-version";
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function isAllowedFile(file: File) {
  const lower = file.name.toLowerCase();
  return (
    ALLOWED.has(file.type) ||
    lower.endsWith(".pdf") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".txt")
  );
}

function extFor(type: string, name: string) {
  const lower = name.toLowerCase();
  if (type === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt")) return "txt";
  return "pdf";
}

function hashBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseFailureMessage(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "";

  if (code === "password_protected_pdf") {
    return "This PDF is password protected. Remove the password or upload a DOCX/text version.";
  }

  if (code === "scanned_pdf") {
    return "This PDF looks scanned or image-only, so JobPosted cannot read the text. Upload a text-based PDF or DOCX.";
  }

  return "Could not parse this resume. Upload a PDF, DOCX, or text resume with selectable text.";
}

async function removeUploadedResume(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  path: string,
  userId: string,
  reason: string,
) {
  const { error } = await supabase.storage.from("resumes").remove([path]);
  if (error) {
    await reportError("onboarding resume cleanup failed", error, { userId, path, reason });
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const proGate = await requireProApi(supabase, user.id);
  if (proGate) return proGate;

  const rateLimit = await checkRateLimit({
    scope: "resume_parse:user",
    key: user.id,
    ...RATE_LIMITS.resumeParse,
  });
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit, "Resume parsing is temporarily rate limited. Try again shortly.");
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large", message: "Max 6 MB." }, { status: 400 });
  }
  if (!isAllowedFile(file)) {
    return NextResponse.json(
      { ok: false, error: "bad_type", message: "Upload a PDF, DOCX, or text resume." },
      { status: 400 },
    );
  }

  const uploadedAt = new Date().toISOString();
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentHash = hashBuffer(bytes);
  const versionId = randomUUID();
  const path = `${user.id}/base/${versionId}.${extFor(file.type, file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(path, bytes, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (uploadError) {
    await reportError("onboarding resume upload failed", uploadError, { userId: user.id });
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }

  const { parseResumeProfileFromBuffer } = await import("@/lib/onboarding/resume-parser");
  const parsed = await parseResumeProfileFromBuffer({
    buffer: bytes,
    fileName: file.name,
    contentType: file.type,
  }).catch((error) => {
    void reportError("onboarding resume parse failed", error, { userId: user.id, fileName: file.name });
    return { error };
  });
  if ("error" in parsed) {
    await removeUploadedResume(supabase, path, user.id, "parse_failed");
    return NextResponse.json(
      { ok: false, error: "parse_failed", message: parseFailureMessage(parsed.error) },
      { status: 422 },
    );
  }

  const sourceDocument: SourceDocument = {
    name: file.name,
    storagePath: path,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt,
    contentHash,
  };

  const content = resumeContentFromProfilePayload(parsed.parsed, sourceDocument);
  const embedding = await embedResumeContent(content).catch(async (error) => {
    await reportError("onboarding resume embedding failed", error, { userId: user.id });
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
    await reportError("onboarding resume version insert failed", versionError, { userId: user.id });
    await removeUploadedResume(supabase, path, user.id, "version_failed");
    return NextResponse.json({ ok: false, error: "version_failed", message: "Could not save this resume." }, { status: 500 });
  }

  const { error: pointerError } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, email: user.email ?? null, active_resume_version_id: version?.id ?? versionId },
      { onConflict: "id" },
    );
  if (pointerError) {
    await reportError("onboarding resume pointer update failed", pointerError, { userId: user.id, versionId: version?.id ?? versionId });
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      type: "base_resume",
      storage_path: path,
    })
    .select("id")
    .single();
  if (documentError) {
    await reportError("onboarding base resume document insert failed", documentError, { userId: user.id });
  }

  return NextResponse.json({
    ok: true,
    name: file.name,
    sourceDocument,
    versionId: version?.id ?? versionId,
    documentId: document?.id ?? null,
    parsed: parsed.parsed,
    diagnostics: parsed.diagnostics,
  });
}
