import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ExtensionResumeOption } from "@jobposted/shared";
import { signedResumeUrl } from "@/lib/extension/resume";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";

export const runtime = "nodejs";

// Base64 of a ~3 MB PDF is ~4 MB, comfortably under the serverless request-body limit.
// Resumes are far smaller in practice; this only guards against accidents.
const MAX_RESUME_BYTES = 3 * 1024 * 1024;

function safeResumeFileName(name: string): string {
  const base = (name || "resume").split(/[\\/]/).pop() || "resume";
  const cleaned = base.replace(/[^\w.\-() ]+/g, "_").trim() || "resume";
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function fileNameFromPath(path: string | null | undefined): string {
  if (!path) return "Resume.pdf";
  try {
    return decodeURIComponent(path.split("/").pop() || "Resume.pdf");
  } catch {
    return path.split("/").pop() || "Resume.pdf";
  }
}

// The extension's "Add resume" picker: the user's résumé documents to attach to a
// tracked application.
export async function GET(request: Request) {
  try {
    const auth = await getExtensionAuthContext(request);
    const { data, error } = await auth.supabase
      .from("documents")
      .select("id,storage_path,type,created_at")
      .eq("user_id", auth.user.id)
      .in("type", ["base_resume", "tailored_resume", "tracker_resume"])
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      console.error("extension resume list failed", error);
      return extensionError("Could not load your resumes.", 500);
    }

    const rows = Array.isArray(data) ? (data as Array<{ id: string; storage_path: string | null; created_at: string | null }>) : [];
    const resumes: ExtensionResumeOption[] = await Promise.all(
      rows
        .filter((row) => typeof row.storage_path === "string" && row.storage_path)
        .map(async (row) => ({
          id: row.id,
          name: fileNameFromPath(row.storage_path),
          createdAt: row.created_at ?? null,
          url: await signedResumeUrl(auth.supabase, row.storage_path),
        })),
    );

    return NextResponse.json({ ok: true, resumes });
  } catch (error) {
    return authErrorResponse(error);
  }
}

// Upload a PDF résumé from the extension → resumes bucket + a documents row.
export async function POST(request: Request) {
  try {
    const auth = await getExtensionAuthContext(request);
    const body = (await request.json().catch(() => null)) as { name?: unknown; dataBase64?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name : "";
    const dataBase64 = typeof body?.dataBase64 === "string" ? body.dataBase64 : "";
    if (!dataBase64) return extensionError("No file provided.", 400);

    let bytes: Buffer;
    try {
      bytes = Buffer.from(dataBase64, "base64");
    } catch {
      return extensionError("Could not read the uploaded file.", 400);
    }
    if (bytes.length === 0) return extensionError("The uploaded file is empty.", 400);
    if (bytes.length > MAX_RESUME_BYTES) return extensionError("PDF is too large (max 3 MB).", 413);
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return extensionError("Only PDF resumes are supported.", 415);
    }

    const fileName = safeResumeFileName(name);
    const storagePath = `${auth.user.id}/uploads/${randomUUID()}/${fileName}`;
    const { error: uploadError } = await auth.supabase.storage
      .from("resumes")
      .upload(storagePath, new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), {
        upsert: false,
        contentType: "application/pdf",
      });
    if (uploadError) {
      console.error("extension resume upload failed", uploadError);
      return extensionError("Could not save the resume.", 500);
    }

    const { data: doc, error: docError } = await auth.supabase
      .from("documents")
      // Distinct type so a résumé uploaded to attach to one tracked job isn't mistaken
      // for the user's global base résumé by autofill/tailoring; still listed in the picker.
      .insert({ user_id: auth.user.id, type: "tracker_resume", storage_path: storagePath })
      .select("id,storage_path,created_at")
      .single();
    if (docError || !doc) {
      console.error("extension resume document insert failed", docError);
      await auth.supabase.storage.from("resumes").remove([storagePath]);
      return extensionError("Could not save the resume.", 500);
    }

    const resume: ExtensionResumeOption = {
      id: doc.id,
      name: fileNameFromPath(doc.storage_path),
      createdAt: doc.created_at ?? null,
      url: await signedResumeUrl(auth.supabase, doc.storage_path),
    };
    return NextResponse.json({ ok: true, resume });
  } catch (error) {
    return authErrorResponse(error);
  }
}
