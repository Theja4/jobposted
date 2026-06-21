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
  // A non-auth failure (DB, storage, profile build) must not masquerade as 401 —
  // the extension treats 401 as "session is dead" and forces a re-login.
  console.error("extension request failed", error);
  return extensionError("Something went wrong loading your profile.", 500);
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function projectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

// Decode (without verifying) the JWT payload so failures can be explained:
// a project mismatch and an expired token both surface as a Supabase 401,
// but the fix is completely different.
function decodeJwt(token: string): { iss?: string; exp?: number; ref?: string } | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function describeToken(token: string, serverRef: string): string {
  const claims = decodeJwt(token);
  if (!claims) return "token=unparseable";
  const tokenRef = claims.ref || projectRef(claims.iss ?? "");
  const exp = typeof claims.exp === "number" ? claims.exp : null;
  const now = Math.floor(Date.now() / 1000);
  const expired = exp !== null ? exp < now : "unknown";
  const projectMatches = tokenRef ? tokenRef === serverRef : "unknown";
  return `tokenProject=${tokenRef || "?"} serverProject=${serverRef || "?"} projectMatches=${projectMatches} expired=${expired} exp=${exp ?? "?"} now=${now}`;
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

  // Validate the token with a CLEAN client. The user token must not be in
  // `global.headers` here: getUser() appends its own capital-case `Authorization`
  // header, which collides with a lowercase `authorization` global header and
  // gets sent as a duplicated `Authorization: Bearer x, Bearer x` that GoTrue
  // rejects with "This endpoint requires a valid Bearer token".
  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    console.error(
      "[extension auth] getUser rejected token —",
      describeToken(token, projectRef(url)),
      "supabaseError=",
      error?.message ?? "no user returned",
    );
    throw new ExtensionAuthError(401, "Invalid or expired extension session.");
  }

  // Data client scoped to the user (RLS) + the `jobposted` schema. It only runs
  // PostgREST/storage queries (never getUser), so the single forwarded
  // `Authorization` header is safe here.
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "jobposted" },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  return { supabase, user: data.user, token };
}
