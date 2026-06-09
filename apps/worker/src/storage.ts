import { db } from "./supabase";

export interface ResumeFile {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

/** Fetch the user's most recent base resume from Storage (design doc §11.1 upload step). */
export async function getBaseResume(userId: string): Promise<ResumeFile | null> {
  const { data: doc } = await db()
    .from("documents")
    .select("storage_path")
    .eq("user_id", userId)
    .eq("type", "base_resume")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!doc?.storage_path) return null;

  const { data, error } = await db().storage.from("resumes").download(doc.storage_path);
  if (error || !data) return null;

  const fileName = doc.storage_path.split("/").pop() ?? "resume.pdf";
  const contentType = fileName.toLowerCase().endsWith(".docx")
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf";
  return { buffer: Buffer.from(await data.arrayBuffer()), fileName, contentType };
}

/** Upload a pre-submit screenshot; returns its storage path. */
export async function uploadScreenshot(
  userId: string,
  applicationId: string,
  png: Buffer,
): Promise<string> {
  const path = `${userId}/${applicationId}.png`;
  const { error } = await db()
    .storage.from("screenshots")
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`screenshot upload failed: ${error.message}`);
  return path;
}
