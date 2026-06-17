import { NextResponse } from "next/server";
import type {
  CanonicalFieldKey,
  ExtensionFieldContext,
  ExtensionFieldMapping,
  MasterProfile,
} from "@jobposted/shared";
import { callGatewayJSON, GatewayError, gatewayConfigured } from "@/lib/ai/gateway";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";

export const runtime = "nodejs";

function gatewayTimeoutMs() {
  const value = Number(process.env.OPENROUTER_TIMEOUT_MS ?? process.env.AI_GATEWAY_TIMEOUT_MS ?? 12_000);
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
  const label = `${field.label} ${field.context ?? ""}`.toLowerCase();
  const answer = profile.answers.find((item) => {
    const key = item.key.toLowerCase();
    return label.includes(key) || key.includes(field.label.toLowerCase());
  });
  if (answer) {
    return {
      canonicalKey: `answers.${answer.key}`,
      value: answer.value,
      confidence: 0.74,
      source: "answer",
      reason: "Matched a reusable answer.",
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

function profileSummary(profile: MasterProfile) {
  return {
    identity: profile.identity,
    location: profile.location,
    links: profile.links,
    workAuth: profile.workAuth,
    compensation: profile.compensation,
    demographics: profile.demographics,
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
          "location.street",
          "location.city",
          "location.state",
          "location.postalCode",
          "location.country",
          "links.portfolio",
          "links.linkedin",
          "links.github",
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
    if (error instanceof GatewayError) console.error("AI field map failed", error.message);
    else console.error("AI field map request failed", error);
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

    const mapping = (await callGateway(field, profile)) ?? localFallback(field, profile);
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
