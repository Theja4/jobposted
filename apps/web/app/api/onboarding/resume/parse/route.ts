import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { reportError } from "@/lib/observability/report";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SourceDocument } from "@/lib/profile/resume-version";

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
    console.error("onboarding resume parse failed", error);
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

  return NextResponse.json({
    ok: true,
    name: file.name,
    sourceDocument,
    parsed: parsed.parsed,
    diagnostics: parsed.diagnostics,
  });
}
