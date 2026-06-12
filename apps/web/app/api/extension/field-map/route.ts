import { NextResponse } from "next/server";
import type {
  CanonicalFieldKey,
  ExtensionFieldContext,
  ExtensionFieldMapping,
  MasterProfile,
} from "@jobposted/shared";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";

export const runtime = "nodejs";

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
    reason: "No cached mapping or AI Gateway response was available.",
  };
}

function profileSummary(profile: MasterProfile) {
  return {
    identity: profile.identity,
    location: profile.location,
    links: profile.links,
    workAuth: profile.workAuth,
    demographics: profile.demographics,
    skills: profile.skills,
    answers: profile.answers,
  };
}

async function callGateway(field: ExtensionFieldContext, profile: MasterProfile) {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) return null;
  const baseUrl = process.env.AI_GATEWAY_BASE_URL || "https://ai-gateway.vercel.sh/v1";
  const model = process.env.AI_GATEWAY_MODEL || "openai/gpt-5-mini";

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Map a job-application form field to the best JobPosted profile key. Return strict JSON: {\"canonicalKey\": string, \"value\": string|boolean|string[]|null, \"confidence\": number, \"reason\": string}. Use unknown/null when not safe.",
        },
        {
          role: "user",
          content: JSON.stringify({
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
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error("AI Gateway field map failed", response.status, await response.text());
    return null;
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const canonicalKey = asString(parsed.canonicalKey) as CanonicalFieldKey;
    const confidence =
      typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    if (!canonicalKey || confidence <= 0) return null;
    return {
      canonicalKey,
      value: parsed.value as ExtensionFieldMapping["value"],
      confidence,
      source: "llm" as const,
      reason: asString(parsed.reason) || "AI Gateway mapping.",
    };
  } catch {
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
