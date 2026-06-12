import { NextResponse } from "next/server";
import { toReusableAnswer } from "@/lib/extension/profile";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getExtensionAuthContext(request);
    const body = (await request.json().catch(() => null)) as unknown;
    const answer = toReusableAnswer(body);
    if (!answer) {
      return extensionError("Invalid reusable answer.", 400);
    }

    const { error } = await supabase.from("profile_answers").upsert(
      {
        user_id: user.id,
        key: answer.key,
        prompt: answer.prompt,
        value: answer.value,
        source: "extension",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" },
    );
    if (error) {
      console.error("extension answer save failed", error);
      return extensionError("Could not save that answer.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
