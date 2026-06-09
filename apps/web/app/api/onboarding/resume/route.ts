import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/**
 * Store a base resume in the private `resumes` bucket (owner-folder RLS) and record a
 * `documents` row. No parsing — Rezoomed auto-parse pre-fill is a Phase 3 integration.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
  }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isDocx =
    file.type.includes("wordprocessingml") || file.name.toLowerCase().endsWith(".docx");
  if (!ALLOWED.has(file.type) && !isPdf && !isDocx) {
    return NextResponse.json({ ok: false, error: "PDF or DOCX only" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "File too large (max 6MB)" }, { status: 413 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${user.id}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("resumes")
    .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({ user_id: user.id, type: "base_resume", storage_path: storagePath })
    .select("id")
    .single();
  if (docErr) {
    return NextResponse.json({ ok: false, error: docErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, documentId: doc.id, storagePath, fileName: file.name });
}
