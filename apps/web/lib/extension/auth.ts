import { NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

export interface ExtensionAuthContext {
  // Supabase's schema generics are noisy here because this client is scoped to
  // the non-public `jobposted` schema at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  user: User;
  token: string;
}

export class ExtensionAuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function extensionError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export function authErrorResponse(error: unknown) {
  if (error instanceof ExtensionAuthError) {
    return extensionError(error.message, error.status);
  }
  console.error("extension auth failed", error);
  return extensionError("Authentication failed.", 401);
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function getExtensionAuthContext(request: Request): Promise<ExtensionAuthContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new ExtensionAuthError(503, "Supabase is not configured.");
  }

  const token = bearerToken(request);
  if (!token) {
    throw new ExtensionAuthError(401, "Missing extension session.");
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "jobposted" },
    global: {
      headers: { authorization: `Bearer ${token}` },
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new ExtensionAuthError(401, "Invalid or expired extension session.");
  }

  return { supabase, user: data.user, token };
}
