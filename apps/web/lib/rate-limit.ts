import "server-only";

import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { reportError } from "@/lib/observability/report";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

function positiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? "");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const RATE_LIMITS = {
  tailor: {
    limit: positiveIntEnv("RATE_LIMIT_TAILOR_PER_HOUR", 20),
    windowSeconds: 60 * 60,
  },
  resumeParse: {
    limit: positiveIntEnv("RATE_LIMIT_RESUME_PARSE_PER_HOUR", 12),
    windowSeconds: 60 * 60,
  },
  fieldMap: {
    limit: positiveIntEnv("RATE_LIMIT_FIELD_MAP_PER_HOUR", 120),
    windowSeconds: 60 * 60,
  },
  waitlist: {
    limit: positiveIntEnv("RATE_LIMIT_WAITLIST_PER_HOUR", 10),
    windowSeconds: 60 * 60,
  },
} as const;

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwarded ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

export async function checkRateLimit(args: {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + args.windowSeconds * 1000);
  const fallback = {
    allowed: true,
    limit: args.limit,
    remaining: Math.max(args.limit - 1, 0),
    resetAt,
    retryAfterSeconds: args.windowSeconds,
  };

  const supabase = getServiceRoleClient();
  if (!supabase) return fallback;

  const { data, error } = await supabase
    .rpc("check_rate_limit", {
      p_scope: args.scope,
      p_key: args.key,
      p_limit: args.limit,
      p_window_seconds: args.windowSeconds,
    })
    .maybeSingle();

  if (error) {
    await reportError("rate limit check failed", error, { scope: args.scope });
    return fallback;
  }

  const row = data as
    | { allowed?: boolean; remaining?: number; reset_at?: string; current_count?: number }
    | null;
  const parsedReset = row?.reset_at ? new Date(row.reset_at) : resetAt;
  const retryAfterSeconds = Math.max(1, Math.ceil((parsedReset.getTime() - now.getTime()) / 1000));

  return {
    allowed: row?.allowed !== false,
    limit: args.limit,
    remaining: Math.max(Number(row?.remaining ?? fallback.remaining) || 0, 0),
    resetAt: parsedReset,
    retryAfterSeconds,
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
  };
}

export function rateLimitResponse(result: RateLimitResult, message = "Too many requests. Try again shortly.") {
  return NextResponse.json(
    { ok: false, error: "rate_limited", message },
    { status: 429, headers: rateLimitHeaders(result) },
  );
}
