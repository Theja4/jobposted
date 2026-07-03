import { NextResponse } from "next/server";
import type {
  CanonicalFieldKey,
  ExtensionFieldContext,
  ExtensionFieldMapping,
  MasterProfile,
} from "@jobposted/shared";
import { isUsableAnswerValue, resolveFieldValue, valueForKey } from "@jobposted/shared";
import { callGatewayJSON, GatewayError, gatewayConfigured } from "@/lib/ai/gateway";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";
import { reportError } from "@/lib/observability/report";
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

function gatewayTimeoutMs() {
  const value = Number(process.env.FIELD_MAP_TIMEOUT_MS ?? process.env.OPENROUTER_TIMEOUT_MS ?? 12_000);
  return Number.isFinite(value) && value > 0 ? Math.min(30_000, Math.floor(value)) : 12_000;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isFieldContext(value: unknown): value is ExtensionFieldContext {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.signature === "string" &&
    typeof v.platform === "string" &&
    typeof v.url === "string" &&
    typeof v.label === "string" &&
    typeof v.type === "string"
  );
}

function localFallback(field: ExtensionFieldContext, profile: MasterProfile): ExtensionFieldMapping {
  const resolved = resolveFieldValue(field, profile, { demographicsEnabled: true });
  if (resolved.canonicalKey !== "unknown" && resolved.confidence >= 0.6) {
    return {
      canonicalKey: resolved.canonicalKey,
      value: resolved.value,
      confidence: Math.min(resolved.confidence, 0.86),
      source: resolved.source,
      reason: resolved.source === "answer" ? "Matched a reusable answer." : "Matched a profile field.",
    };
  }
  return {
    canonicalKey: "unknown",
    value: null,
    confidence: 0,
    source: "skip",
    reason: "No cached mapping or AI response was available.",
  };
}

function safeMapping(
  field: ExtensionFieldContext,
  profile: MasterProfile,
  mapping: ExtensionFieldMapping,
): ExtensionFieldMapping {
  if (mapping.canonicalKey === "unknown") return mapping;
  const value =
    mapping.value !== undefined ? mapping.value : valueForKey(profile, mapping.canonicalKey);
  if (
    typeof value === "string" &&
    !isUsableAnswerValue({ prompt: field.label, value }, `${field.label} ${field.context ?? ""}`)
  ) {
    return {
      canonicalKey: "unknown",
      value: null,
      confidence: 0,
      source: "skip",
      reason: "Mapped value matched the field prompt.",
    };
  }
  return { ...mapping, value };
}

function profileSummary(profile: MasterProfile) {
  return {
    identity: profile.identity,
    location: profile.location,
    links: profile.links,
    workAuth: profile.workAuth,
    compensation: profile.compensation,
    demographics: profile.demographics,
    experience: profile.experience.slice(0, 8).map((item) => ({
      title: item.title,
      company: item.company,
      startDate: item.startDate,
      endDate: item.endDate,
      current: item.current,
    })),
    skills: profile.skills,
    answers: profile.answers,
  };
}

async function callGateway(field: ExtensionFieldContext, profile: MasterProfile) {
  if (!gatewayConfigured()) return null;
  try {
    const parsed = await callGatewayJSON<Record<string, unknown>>({
      timeoutMs: gatewayTimeoutMs(),
      maxTokens: 700,
      system:
        'Map a job-application form field to the best JobPosted profile key. Return strict JSON: {"canonicalKey": string, "value": string|boolean|string[]|null, "confidence": number, "reason": string}. Use unknown/null when not safe.',
      user: JSON.stringify({
        field,
        allowedKeys: [
          "identity.fullName",
          "identity.firstName",
          "identity.lastName",
          "identity.preferredName",
          "identity.email",
          "identity.phone",
          "identity.phoneCountryCode",
          "identity.phoneNational",
          "location.street",
          "location.city",
          "location.state",
          "location.postalCode",
          "location.country",
          "links.portfolio",
          "links.linkedin",
          "links.github",
          "links.website",
          "workAuth.authorizedToWork",
          "workAuth.requiresSponsorship",
          "workAuth.country",
          "compensation.current",
          "compensation.currentCurrency",
          "compensation.expected",
          "compensation.expectedCurrency",
          "demographics.gender",
          "demographics.race",
          "demographics.veteranStatus",
          "demographics.disabilityStatus",
          "demographics.hispanicLatino",
          "documents.resume",
          "documents.coverLetter",
          "experience.currentCompany",
          "experience",
          "education",
          "skills",
          "unknown",
          "answers.<key>",
        ],
        profile: profileSummary(profile),
      }),
    });
    const canonicalKey = asString(parsed.canonicalKey) as CanonicalFieldKey;
    const confidence =
      typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    if (!canonicalKey || confidence <= 0) return null;
    return {
      canonicalKey,
      value: parsed.value as ExtensionFieldMapping["value"],
      confidence,
      source: "llm" as const,
      reason: asString(parsed.reason) || "AI mapping.",
    };
  } catch (error) {
    await reportError(error instanceof GatewayError ? "AI field map failed" : "AI field map request failed", error, {
      platform: field.platform,
      signature: field.signature,
    });
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getExtensionAuthContext(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const field = body?.field;
    const profile = body?.profile as MasterProfile | undefined;
    if (!isFieldContext(field) || !profile) {
      return extensionError("Invalid field-map payload.", 400);
    }

    const { data: cached } = await supabase
      .from("extension_field_mappings")
      .select("canonical_key,value,confidence,source")
      .eq("user_id", user.id)
      .eq("platform", field.platform)
      .eq("field_signature", field.signature)
      .maybeSingle();

    if (cached) {
      return NextResponse.json({
        ok: true,
        mapping: {
          canonicalKey: cached.canonical_key,
          value: cached.value,
          confidence: Number(cached.confidence) || 0,
          source: "cache",
          reason: "Previously mapped for this platform.",
        },
      });
    }

    const rateLimit = await checkRateLimit({
      scope: "field_map:user",
      key: user.id,
      ...RATE_LIMITS.fieldMap,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, "Field mapping is temporarily rate limited. Try again shortly.");
    }

    const mapping = safeMapping(field, profile, (await callGateway(field, profile)) ?? localFallback(field, profile));
    if (mapping.confidence >= 0.6 && mapping.canonicalKey !== "unknown") {
      await supabase.from("extension_field_mappings").upsert(
        {
          user_id: user.id,
          platform: field.platform,
          field_signature: field.signature,
          label: field.label,
          canonical_key: mapping.canonicalKey,
          value: mapping.value ?? null,
          confidence: mapping.confidence,
          source: mapping.source,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform,field_signature" },
      );
    }

    return NextResponse.json({ ok: true, mapping });
  } catch (error) {
    return authErrorResponse(error);
  }
}
